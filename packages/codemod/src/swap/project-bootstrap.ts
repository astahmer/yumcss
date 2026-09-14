import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
	buildPandwindInteropArtifact,
	generateDesignSystem,
	generateUtilityBridge,
	buildThemeBlock,
	BRIDGE_PROPS,
	type UtilityBridge,
} from "../tw/index.ts";
import { extractTwConfig } from "pandwind/vite/inline";
import type {
	AdapterConfigContext,
	AdapterConditionCatalog,
	AdapterGeneratedFile,
	AdapterProjectConfig,
	AdapterProjectBindings,
} from "./adapter-contract.ts";
import type { PandwindMeta } from "../meta.ts";
import { loadMetaFromSources } from "../meta.ts";
import { createBuiltinCodemodCatalog } from "./adapter-catalog.ts";
import { CodemodAdapterId, SwapTargetId } from "./identifiers.ts";
import {
	PANDWIND_NEXT_CSS_ID,
	planPandwindNextIntegration,
	type HostFileChange,
} from "./host-integration.ts";
import { PANDWIND_RAW_PROPERTIES, PANDWIND_TOKEN_PROPERTIES } from "./adapters/panda/properties.ts";

export interface ProjectBootstrapRequest {
	readonly root: string;
	readonly sourceAdapter: string;
	readonly targetAdapter: string;
	readonly outputDirectory: string;
	readonly readFile: (file: string) => string | undefined;
	readonly listFiles: (root: string) => readonly string[];
	readonly packageJson?: Readonly<Record<string, unknown>>;
}

export interface PandwindProjectSupport {
	readonly metaDirectory: string;
	readonly bindings: AdapterProjectBindings;
	readonly files: readonly AdapterGeneratedFile[];
	/** Existing source files that the target project no longer needs to load. */
	readonly fileChanges: readonly {
		readonly path: string;
		readonly content: string;
		readonly expectedContent?: string;
	}[];
	readonly meta?: PandwindMeta;
	readonly sourceConfig: AdapterProjectConfig;
}

const posixPath = (value: string): string => value.replaceAll("\\", "/");

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const projectFile = (directory: string, name: string): string =>
	posixPath(join(directory.replaceAll("\\", "/"), name));

const PANDWIND_PROJECT_TARGETS = [
	CodemodAdapterId.Pandwind,
	SwapTargetId.CssClass,
	SwapTargetId.Tw,
	SwapTargetId.Dss,
	SwapTargetId.Design,
] as const;

const isPandwindProjectTarget = (target: string): boolean =>
	PANDWIND_PROJECT_TARGETS.includes(target as (typeof PANDWIND_PROJECT_TARGETS)[number]);

const scalarTokenValues = (config: AdapterProjectConfig): Set<string> =>
	new Set(
		Object.values(config.tokenCatalog?.groups ?? {}).flatMap((group) => Object.values(group)),
	);

function presetPropertiesSource(
	groups: Readonly<Record<string, Readonly<Record<string, string>>>>,
): string {
	const properties: Record<string, { $tokens: string; $strictness: "inherits" } | true> = {
		...PANDWIND_RAW_PROPERTIES,
	};
	for (const [property, group] of Object.entries(PANDWIND_TOKEN_PROPERTIES)) {
		if (groups[group] !== undefined)
			properties[property] = { $tokens: group, $strictness: "inherits" };
	}
	return JSON.stringify(properties, null, "\t");
}

function pandwindTokenGroups(
	groups: Readonly<Record<string, Readonly<Record<string, string>>>>,
): Record<string, Record<string, string>> {
	return Object.fromEntries(
		Object.entries(groups).map(([group, values]) => [
			group,
			Object.fromEntries(
				Object.entries(values).map(([key, value]) => [key.replace(/^\$/u, ""), value]),
			),
		]),
	);
}

const scalarToken = (value: unknown): string | undefined =>
	typeof value === "string" || typeof value === "number" ? String(value) : undefined;

const tokenTreeRecord = (value: unknown): Record<string, unknown> | undefined =>
	typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;

const flattenRawTokenGroups = (
	groups: Readonly<Record<string, unknown>>,
): Record<string, Record<string, string>> => {
	const result: Record<string, Record<string, string>> = {};
	const visit = (group: string, value: unknown, path: readonly string[]): void => {
		const record = tokenTreeRecord(value);
		if (record !== undefined && Object.hasOwn(record, "value")) {
			const scalar = scalarToken(record.value);
			if (scalar !== undefined) (result[group] ??= {})[path.join(".")] = scalar;
			return;
		}
		const scalar = scalarToken(value);
		if (scalar !== undefined) {
			(result[group] ??= {})[path.join(".")] = scalar;
			return;
		}
		if (record === undefined) return;
		for (const [key, child] of Object.entries(record)) visit(group, child, [...path, key]);
	};
	for (const [group, values] of Object.entries(groups)) visit(group, values, []);
	return result;
};

const normalizeTokenReference = (value: string): string =>
	/^\{([^}]+)\}$/u.exec(value)?.[1] ?? value;

const flattenSemanticTokenGroups = (
	groups: Readonly<Record<string, unknown>>,
): Record<string, Record<string, Record<string, string>>> => {
	const result: Record<string, Record<string, Record<string, string>>> = {};
	const visit = (group: string, value: unknown, path: readonly string[]): void => {
		const record = tokenTreeRecord(value);
		if (record !== undefined && Object.hasOwn(record, "value")) {
			const tokenValue = record.value;
			const branches: Record<string, string> = {};
			const branchRecord = tokenTreeRecord(tokenValue);
			if (branchRecord !== undefined) {
				for (const [condition, branch] of Object.entries(branchRecord)) {
					const scalar = scalarToken(branch);
					if (scalar !== undefined) branches[condition] = normalizeTokenReference(scalar);
				}
			} else {
				const scalar = scalarToken(tokenValue);
				if (scalar !== undefined) branches.base = normalizeTokenReference(scalar);
			}
			if (Object.keys(branches).length > 0) (result[group] ??= {})[path.join(".")] = branches;
			return;
		}
		if (record === undefined) return;
		for (const [key, child] of Object.entries(record)) visit(group, child, [...path, key]);
	};
	for (const [group, values] of Object.entries(groups)) visit(group, values, []);
	return result;
};

const isComponentTokenPath = (path: string): boolean =>
	path.startsWith("component.") || path.startsWith("component-") || path.startsWith("$component-");

const selectTokenPaths = (
	groups: Readonly<Record<string, Readonly<Record<string, string>>>>,
	component: boolean,
): Record<string, Record<string, string>> => {
	const result: Record<string, Record<string, string>> = {};
	for (const [group, values] of Object.entries(groups)) {
		for (const [path, value] of Object.entries(values)) {
			if (isComponentTokenPath(path) !== component) continue;
			(result[group] ??= {})[path] = value;
		}
	}
	return result;
};

const selectSemanticTokenPaths = (
	groups: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, string>>>>>>,
	component: boolean,
): Record<string, Record<string, Record<string, string>>> => {
	const result: Record<string, Record<string, Record<string, string>>> = {};
	for (const [group, values] of Object.entries(groups)) {
		for (const [path, branches] of Object.entries(values)) {
			if (isComponentTokenPath(path) !== component) continue;
			(result[group] ??= {})[path] = { ...branches };
		}
	}
	return result;
};

const mergeSemanticTokenGroups = (
	...layers: ReadonlyArray<
		Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, string>>>>>>
	>
): Record<string, Record<string, Record<string, string>>> => {
	const result: Record<string, Record<string, Record<string, string>>> = {};
	for (const layer of layers) {
		for (const [group, values] of Object.entries(layer)) {
			for (const [path, branches] of Object.entries(values)) {
				const groupValues = (result[group] ??= {});
				const pathValues = groupValues[path];
				groupValues[path] =
					pathValues === undefined ? { ...branches } : { ...pathValues, ...branches };
			}
		}
	}
	return result;
};

const normalizeSemanticTokenGroups = (
	groups: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, string>>>>>>,
	rawTokens: Readonly<Record<string, Readonly<Record<string, string>>>>,
): Record<string, Record<string, Record<string, string>>> =>
	Object.fromEntries(
		Object.entries(groups).map(([group, values]) => [
			group,
			Object.fromEntries(
				Object.entries(values).map(([path, branches]) => [
					path,
					Object.fromEntries(
						Object.entries(branches).map(([condition, value]) => [
							condition,
							projectTokenReference(value, group, rawTokens),
						]),
					),
				]),
			),
		]),
	);

const generatedTokenKey = (path: string): string => path.replaceAll("$", "");

const tokenKeyForPath = (
	group: string,
	path: string,
	rawTokens: Readonly<Record<string, Readonly<Record<string, string>>>>,
): string | undefined => {
	if (rawTokens[group]?.[path] !== undefined) return path;
	const generated = generatedTokenKey(path);
	if (rawTokens[group]?.[generated] !== undefined) return generated;
	const rawGenerated = generatedTokenKey(`raw.${path}`);
	return rawTokens[group]?.[rawGenerated] === undefined ? undefined : rawGenerated;
};

const projectTokenReference = (
	value: string,
	group: string,
	rawTokens: Readonly<Record<string, Readonly<Record<string, string>>>>,
): string => {
	const candidate = /^\{([^}]+)\}$/u.exec(value)?.[1] ?? value;
	const separator = candidate.indexOf(".");
	if (separator > 0) {
		const referenceGroup = candidate.slice(0, separator);
		const referencePath = candidate.slice(separator + 1);
		const referenceKey = tokenKeyForPath(referenceGroup, referencePath, rawTokens);
		if (referenceKey !== undefined) return `${referenceGroup}.${referenceKey}`;
	}
	const tokenKey = tokenKeyForPath(group, candidate, rawTokens);
	if (tokenKey !== undefined) return `${group}.${tokenKey}`;
	const rawMatch = Object.entries(rawTokens[group] ?? {}).find(
		([, rawValue]) => rawValue === candidate || rawValue === value,
	);
	return rawMatch === undefined ? value : `${group}.${rawMatch[0]}`;
};

const isUnresolvedTokenReference = (value: string): boolean =>
	/^\{[^}]+\}$/u.test(value) ||
	value.startsWith("$") ||
	/^[a-z][a-z0-9-]*\.[a-z0-9$_.-]+$/u.test(value);

const withComponentRawAliases = (
	componentTokens: Readonly<Record<string, Readonly<Record<string, string>>>>,
	rawTokens: Readonly<Record<string, Readonly<Record<string, string>>>>,
): Record<string, Record<string, string>> => {
	const result: Record<string, Record<string, string>> = Object.fromEntries(
		Object.entries(rawTokens).map(([group, values]) => [group, { ...values }]),
	);
	for (const [group, values] of Object.entries(componentTokens)) {
		for (const [path, value] of Object.entries(values)) {
			const reference = projectTokenReference(value, group, result);
			if (reference !== value || isUnresolvedTokenReference(value)) continue;
			(result[group] ??= {})[generatedTokenKey(`raw.${path}`)] = value;
		}
	}
	return result;
};

const componentSemanticTokenGroups = (
	componentTokens: Readonly<Record<string, Readonly<Record<string, string>>>>,
	rawTokens: Readonly<Record<string, Readonly<Record<string, string>>>>,
): Record<string, Record<string, Record<string, string>>> =>
	Object.fromEntries(
		Object.entries(componentTokens).map(([group, values]) => [
			group,
			Object.fromEntries(
				Object.entries(values).map(([path, value]) => [
					generatedTokenKey(path),
					{ base: projectTokenReference(value, group, rawTokens) },
				]),
			),
		]),
	);

function customVariantConditions(css: string): Record<string, string> {
	const conditions: Record<string, string> = {};
	for (const line of css.split("\n")) {
		const match = /^\s*@custom-variant\s+([\w-]+)\s*\((.*)\)\s*;\s*$/u.exec(line);
		if (match?.[1] !== undefined && match[2] !== undefined) conditions[match[1]] = match[2].trim();
	}
	return conditions;
}

const TAILWIND_CONFIGURATION_RULES = new Set([
	"theme",
	"utility",
	"plugin",
	"custom-variant",
	"source",
	"reference",
	"config",
]);

const TAILWIND_IMPORT = /^@import\s+(?:url\(\s*)?["']tailwindcss["']\s*\)?\s*;$/u;

function cssAtRuleEnd(source: string, start: number): number {
	let quote: string | undefined;
	let comment = false;
	let braces = 0;
	for (let index = start; index < source.length; index++) {
		const character = source[index]!;
		const next = source[index + 1];
		if (comment) {
			if (character === "*" && next === "/") {
				comment = false;
				index++;
			}
			continue;
		}
		if (quote !== undefined) {
			if (character === "\\") index++;
			else if (character === quote) quote = undefined;
			continue;
		}
		if (character === "/" && next === "*") {
			comment = true;
			index++;
			continue;
		}
		if (character === '"' || character === "'") {
			quote = character;
			continue;
		}
		if (character === "{") {
			braces++;
			continue;
		}
		if (character === "}" && braces > 0) {
			braces--;
			if (braces === 0) return index + 1;
			continue;
		}
		if (character === ";" && braces === 0) return index + 1;
	}
	return source.length;
}

/** Remove Tailwind graph directives after their values have been captured by the official loader. */
function stripTailwindConfiguration(source: string): string {
	let output = "";
	let index = 0;
	let quote: string | undefined;
	let comment = false;
	while (index < source.length) {
		const character = source[index]!;
		const next = source[index + 1];
		if (comment) {
			output += character;
			if (character === "*" && next === "/") {
				output += next;
				index += 2;
				comment = false;
				continue;
			}
			index++;
			continue;
		}
		if (quote !== undefined) {
			output += character;
			if (character === "\\" && next !== undefined) {
				output += next;
				index += 2;
				continue;
			}
			if (character === quote) quote = undefined;
			index++;
			continue;
		}
		if (character === "/" && next === "*") {
			output += "/*";
			index += 2;
			comment = true;
			continue;
		}
		if (character === '"' || character === "'") {
			output += character;
			quote = character;
			index++;
			continue;
		}
		if (character !== "@") {
			output += character;
			index++;
			continue;
		}
		const match = /^@([A-Za-z-]+)/u.exec(source.slice(index));
		if (match?.[1] === undefined) {
			output += character;
			index++;
			continue;
		}
		const end = cssAtRuleEnd(source, index + match[0].length);
		const fragment = source.slice(index, end);
		const name = match[1].toLowerCase();
		const remove =
			TAILWIND_CONFIGURATION_RULES.has(name) ||
			(name === "import" && TAILWIND_IMPORT.test(fragment));
		if (!remove) output += fragment;
		index = end;
	}
	return output.trim() === "" ? "" : output;
}

function stylesheetImportTarget(file: string, specifier: string): string | undefined {
	if (!specifier.startsWith(".")) return undefined;
	return resolve(dirname(file), specifier);
}

function removeTailwindStylesheetImports(
	request: ProjectBootstrapRequest,
	config: AdapterProjectConfig,
): readonly {
	readonly path: string;
	readonly content: string;
	readonly expectedContent: string;
}[] {
	if (config.adapter !== CodemodAdapterId.Tailwind) return [];
	const cssEntry = config.files.find((file) => file.endsWith(".css"));
	if (cssEntry === undefined) return [];
	const stylesheet = request.readFile(cssEntry);
	if (stylesheet === undefined || stripTailwindConfiguration(stylesheet).trim() !== "") return [];
	const target = resolve(request.root, cssEntry);
	const changes: {
		path: string;
		content: string;
		expectedContent: string;
	}[] = [];
	for (const file of request.listFiles(request.root)) {
		const absoluteFile = resolve(request.root, file);
		if (!/\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/u.test(absoluteFile)) continue;
		const source = request.readFile(absoluteFile);
		if (source === undefined) continue;
		const next = source.replace(
			/^[ \t]*import\s*["']([^"']+\.css)["']\s*;?[ \t]*$/gmu,
			(statement, specifier: string) =>
				stylesheetImportTarget(absoluteFile, specifier) === target ? "" : statement,
		);
		if (next === source) continue;
		changes.push({
			path: relative(request.root, absoluteFile).replaceAll("\\", "/"),
			content: next,
			expectedContent: source,
		});
	}
	return changes;
}

function removePandaStylesheetImports(
	request: ProjectBootstrapRequest,
	config: AdapterProjectConfig,
): readonly {
	readonly path: string;
	readonly content: string;
	readonly expectedContent: string;
}[] {
	if (config.adapter !== CodemodAdapterId.Panda) return [];
	const stylesheet = request
		.listFiles(request.root)
		.find((file) => /(?:^|[\\/])styled-system[\\/]styles\.css$/u.test(file));
	if (stylesheet === undefined) return [];
	const target = resolve(request.root, stylesheet);
	const changes: {
		path: string;
		content: string;
		expectedContent: string;
	}[] = [];
	for (const file of request.listFiles(request.root)) {
		const absoluteFile = resolve(request.root, file);
		if (!/\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/u.test(absoluteFile)) continue;
		const source = request.readFile(absoluteFile);
		if (source === undefined) continue;
		const next = source.replace(
			/^[ \t]*import\s*["']([^"']+styled-system[\\/]styles\.css)["']\s*;?[ \t]*$/gmu,
			(statement, specifier: string) =>
				stylesheetImportTarget(absoluteFile, specifier) === target ? "" : statement,
		);
		if (next === source) continue;
		changes.push({
			path: relative(request.root, absoluteFile).replaceAll("\\", "/"),
			content: next,
			expectedContent: source,
		});
	}
	return changes;
}

function removeUnoStylesheetImports(
	request: ProjectBootstrapRequest,
	config: AdapterProjectConfig,
): readonly {
	readonly path: string;
	readonly content: string;
	readonly expectedContent: string;
}[] {
	if (config.adapter !== CodemodAdapterId.UnoCSS) return [];
	const changes: {
		path: string;
		content: string;
		expectedContent: string;
	}[] = [];
	for (const file of request.listFiles(request.root)) {
		const absoluteFile = resolve(request.root, file);
		if (!/\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/u.test(absoluteFile)) continue;
		const source = request.readFile(absoluteFile);
		if (source === undefined) continue;
		const next = source.replace(
			/^[ \t]*import\s*["'](?:virtual:uno\.css|uno\.css)["']\s*;?[ \t]*$/gmu,
			"",
		);
		if (next === source) continue;
		changes.push({
			path: relative(request.root, absoluteFile).replaceAll("\\", "/"),
			content: next,
			expectedContent: source,
		});
	}
	return changes;
}

function rewriteTailwindStylesheets(
	request: ProjectBootstrapRequest,
	config: AdapterProjectConfig,
): readonly {
	readonly path: string;
	readonly content: string;
	readonly expectedContent: string;
}[] {
	if (config.adapter !== CodemodAdapterId.Tailwind) return [];
	const changes: {
		path: string;
		content: string;
		expectedContent: string;
	}[] = [];
	for (const file of config.files.filter((candidate) => candidate.endsWith(".css"))) {
		const source = request.readFile(file);
		if (source === undefined) continue;
		const content = stripTailwindConfiguration(source);
		if (content.trim() === "" || content === source) continue;
		changes.push({
			path: relative(request.root, resolve(request.root, file)).replaceAll("\\", "/"),
			content,
			expectedContent: source,
		});
	}
	return changes;
}

function rewritePandwindViteConfigs(
	request: ProjectBootstrapRequest,
	config: AdapterProjectConfig,
	outputDirectory: string,
): readonly {
	readonly path: string;
	readonly content: string;
	readonly expectedContent: string;
}[] {
	if (request.targetAdapter !== CodemodAdapterId.Pandwind) return [];
	const presetPath = resolve(request.root, outputDirectory, "preset");
	const changes: {
		path: string;
		content: string;
		expectedContent: string;
	}[] = [];
	for (const file of request.listFiles(request.root)) {
		const absoluteFile = resolve(request.root, file);
		if (!/(?:^|\/)vite\.config\.[cm]?[jt]s$/u.test(absoluteFile)) continue;
		const source = request.readFile(absoluteFile);
		if (source === undefined) continue;
		const presetSpecifier = relative(dirname(absoluteFile), presetPath).replaceAll("\\", "/");
		const normalizedSpecifier = presetSpecifier.startsWith(".")
			? presetSpecifier
			: `./${presetSpecifier}`;
		const typedPresetSpecifier = `${normalizedSpecifier}.ts`;
		const pandwindPlugin = 'pandwindCssVite(pandwindPreset, { root: "." })';
		let next: string;
		if (
			config.adapter === CodemodAdapterId.Tailwind &&
			source.includes("@tailwindcss/vite") &&
			/\btailwindcss\s*\(\s*\)/u.test(source)
		) {
			next = source
				.replace(
					/import\s+tailwindcss\s+from\s+["']@tailwindcss\/vite["'];?/u,
					`import { pandwindCssVite } from "pandwind/vite";\nimport { pandwindPreset } from "${typedPresetSpecifier}";`,
				)
				.replace(/\btailwindcss\s*\(\s*\)/gu, pandwindPlugin);
		} else if (config.adapter === CodemodAdapterId.UnoCSS) {
			const unoImport = /import\s+([A-Za-z_$][\w$]*)\s+from\s+["']unocss\/vite["'];?/u.exec(source);
			const unoBinding = unoImport?.[1];
			if (unoImport === null || unoBinding === undefined) continue;
			const call = new RegExp(`\\b${escapeRegExp(unoBinding)}\\s*\\(\\s*\\)`, "u");
			if (!call.test(source)) continue;
			next = source
				.replace(
					/import\s+[A-Za-z_$][\w$]*\s+from\s+["']unocss\/vite["'];?/u,
					`import { pandwindCssVite } from "pandwind/vite";\nimport { pandwindPreset } from "${typedPresetSpecifier}";`,
				)
				.replace(call, pandwindPlugin);
		} else {
			if (source.includes("pandwindCssVite(")) continue;
			const withImports =
				`import { pandwindCssVite } from "pandwind/vite";\nimport { pandwindPreset } from "${typedPresetSpecifier}";\n` +
				source;
			if (/\bplugins\s*:\s*\[\s*\]/u.test(withImports)) {
				next = withImports.replace(/(\bplugins\s*:\s*)\[\s*\]/u, `$1[${pandwindPlugin}]`);
			} else if (/\bplugins\s*:\s*\[/u.test(withImports)) {
				next = withImports.replace(/(\bplugins\s*:\s*\[)/u, `$1${pandwindPlugin}, `);
			} else if (/defineConfig\s*\(\s*\{\s*/u.test(withImports)) {
				next = withImports.replace(
					/(defineConfig\s*\(\s*\{\s*)/u,
					`$1plugins: [${pandwindPlugin}], `,
				);
			} else {
				continue;
			}
		}
		if (next === source) continue;
		changes.push({
			path: relative(request.root, absoluteFile).replaceAll("\\", "/"),
			content: next,
			expectedContent: source,
		});
	}
	return changes;
}

function enableTypeScriptExtensionImports(
	request: ProjectBootstrapRequest,
	needsExtensionImports: boolean,
): readonly {
	readonly path: string;
	readonly content: string;
	readonly expectedContent: string;
}[] {
	if (!needsExtensionImports) return [];
	const configPath = request.listFiles(request.root).find((file) => {
		return resolve(request.root, file) === resolve(request.root, "tsconfig.json");
	});
	if (configPath === undefined) return [];
	const source = request.readFile(resolve(request.root, configPath));
	if (source === undefined || /"allowImportingTsExtensions"\s*:\s*true/u.test(source)) return [];
	const newline = source.includes("\r\n") ? "\r\n" : "\n";
	const compilerOptions = /("compilerOptions"\s*:\s*\{)/u.exec(source);
	let content: string;
	if (compilerOptions !== null && compilerOptions.index !== undefined) {
		const lineStart = source.lastIndexOf("\n", compilerOptions.index) + 1;
		const linePrefix = source.slice(lineStart, compilerOptions.index);
		const indentation = /^\s*/u.exec(linePrefix)?.[0] ?? "";
		content =
			source.slice(0, compilerOptions.index + compilerOptions[0].length) +
			`${newline}${indentation}\t"allowImportingTsExtensions": true,` +
			source.slice(compilerOptions.index + compilerOptions[0].length);
	} else {
		const openingBrace = source.indexOf("{");
		if (openingBrace < 0) return [];
		content =
			source.slice(0, openingBrace + 1) +
			`${newline}\t"compilerOptions": {${newline}\t\t"allowImportingTsExtensions": true${newline}\t},` +
			source.slice(openingBrace + 1);
	}
	if (content === source) return [];
	return [
		{
			path: relative(request.root, resolve(request.root, configPath)).replaceAll("\\", "/"),
			content,
			expectedContent: source,
		},
	];
}

function presetSource(
	config: AdapterProjectConfig,
	conditions: AdapterConditionCatalog,
	typescript = true,
): string {
	const sourceTokens = config.tokenCatalog?.groups ?? {};
	const rawSourceTokens =
		config.tokenDefinitions === undefined
			? sourceTokens
			: flattenRawTokenGroups(config.tokenDefinitions.raw);
	const sourceSemanticTokens =
		config.tokenDefinitions === undefined
			? {}
			: flattenSemanticTokenGroups(config.tokenDefinitions.semantic);
	const componentSourceTokens = pandwindTokenGroups(selectTokenPaths(rawSourceTokens, true));
	const appTokens = withComponentRawAliases(
		componentSourceTokens,
		pandwindTokenGroups(selectTokenPaths(rawSourceTokens, false)),
	);
	const appSemanticTokens = normalizeSemanticTokenGroups(
		selectSemanticTokenPaths(sourceSemanticTokens, false),
		appTokens,
	);
	const componentTokens = mergeSemanticTokenGroups(
		componentSemanticTokenGroups(componentSourceTokens, appTokens),
		normalizeSemanticTokenGroups(selectSemanticTokenPaths(sourceSemanticTokens, true), appTokens),
	);
	const appSemanticGroups = Object.keys(appSemanticTokens);
	const componentGroups = Object.keys(componentTokens);
	const semanticGroups = [...new Set([...appSemanticGroups, ...componentGroups])];
	const presetConditions: AdapterConditionCatalog = {
		base: "",
		...config.conditionCatalog,
		...conditions,
	};
	const hasSemanticTokens = semanticGroups.length > 0;
	const semanticTokenImport = hasSemanticTokens ? ", defineSemanticTokens" : "";
	const semanticTokenTypeImport = hasSemanticTokens ? ", type SemanticTokenLayer" : "";
	const typeImports = typescript ? ", type PandwindProperties" : "";
	const configDeclaration = typescript ? "\nconst cssConfig: PandwindProperties = {};\n" : "";
	const configReference = typescript ? "cssConfig" : "{}";
	const semanticTokenCatalogDeclaration = hasSemanticTokens
		? `type SemanticTokenCatalog = typeof appTokens${
				appSemanticGroups.length === 0 ? "" : " & typeof appSemanticTokenDefinitions"
			} ;\n`
		: "";
	const appSemanticDeclaration =
		appSemanticGroups.length === 0
			? ""
			: `const appSemanticTokenDefinitions = ${JSON.stringify(appSemanticTokens, null, "\t")} as const;
const appSemanticTokens = defineSemanticTokens(
	conditions,
	appSemanticTokenDefinitions satisfies SemanticTokenLayer<typeof conditions, SemanticTokenCatalog>,
);
`;
	const componentDeclaration =
		componentGroups.length === 0
			? ""
			: `const componentTokenDefinitions = ${JSON.stringify(componentTokens, null, "\t")} as const;
const componentTokens = defineSemanticTokens(
	conditions,
	componentTokenDefinitions satisfies SemanticTokenLayer<typeof conditions, SemanticTokenCatalog>,
);
`;
	const mergedTokenLines = semanticGroups.map((group) => {
		const references = [
			...(Object.hasOwn(appTokens, group) ? [`...appTokens[${JSON.stringify(group)}]`] : []),
			...(appSemanticGroups.includes(group)
				? [`...appSemanticTokens[${JSON.stringify(group)}]`]
				: []),
			...(componentGroups.includes(group) ? [`...componentTokens[${JSON.stringify(group)}]`] : []),
		];
		return `\t${JSON.stringify(group)}: { ${references.join(", ")} },`;
	});
	const tokenDeclaration = !hasSemanticTokens
		? "const tokens = appTokens;"
		: `const tokens = {\n\t...appTokens,\n${mergedTokenLines.join("\n")}\n};`;
	return `import { defineConditions, definePreset, defineProperties, defineTokens${semanticTokenImport}${typeImports}${semanticTokenTypeImport} } from "pandwind/preset";

const conditions = defineConditions(${JSON.stringify(presetConditions, null, "\t")} as const);
const appTokens = defineTokens(${JSON.stringify(appTokens, null, "\t")} as const);
${semanticTokenCatalogDeclaration}${appSemanticDeclaration}${componentDeclaration}${configDeclaration}
const properties = defineProperties(${presetPropertiesSource(rawSourceTokens)} as const);
${tokenDeclaration}

export const pandwindPreset = definePreset(
	{
		config: ${configReference},
		tokens,
	},
	{
		strict: true,
		conditions,
		properties,
	},
);
`;
}

function cssSource(nextHost: boolean): string {
	const virtualId = nextHost ? PANDWIND_NEXT_CSS_ID : "pandwind:css";
	return `/// <reference path="./vite-env.d.ts" />
import "${virtualId}";
import { createCss, type AtomicStyleProps } from "pandwind/css";
import { pandwindPreset } from "./preset";

export const css = createCss(pandwindPreset);
export type StyleProps = AtomicStyleProps<typeof css>;
`;
}

function stackSource(): string {
	return `import { createStack } from "pandwind/stack/react";
import { css } from "./css";

export const Stack = createStack(css);
export type { StackComponentProps, StackProps } from "pandwind/stack/react";
`;
}

function viteEnvSource(): string {
	return `/// <reference types="vite/client" />

/** Virtual CSS module served by \`pandwindCssVite\`. */
declare module "pandwind:css";
/** File-like virtual CSS module served by \`pandwindWebpackCss\`. */
declare module "${PANDWIND_NEXT_CSS_ID}";
`;
}

function runtimeCssSource(): string {
	return `import { createRuntimeCss } from "pandwind/css/runtime";
import { pandwindPreset } from "./preset";

export const css = createRuntimeCss(pandwindPreset);
`;
}

function dssSource(): string {
	return `import { createDesignCss } from "pandwind/design";
import { pandwindPreset } from "./preset";

export const dss = createDesignCss(pandwindPreset);
`;
}

function cxSource(): string {
	return `import { createCx } from "pandwind/cx";
import { css } from "./css";

export const cx = createCx({ css });
`;
}

function bridgeSource(bridge: UtilityBridge, twSource: string, presetImport: string): string {
	const config = extractTwConfig(twSource);
	if (config === undefined) throw new Error("codemod: generated tw config is not readable");
	return `import { createTwAdapter } from "pandwind/tw";
import { pandwindPreset } from "${presetImport}";

export const bridge = ${JSON.stringify(bridge)} as const;
export const variants = ${JSON.stringify(config.variants)} as const;
export const twAdapter = createTwAdapter({
	preset: pandwindPreset,
	variants,
	bridge,
});
`;
}

function generatedFile(path: string, content: string, purpose: string): AdapterGeneratedFile {
	return { path, content, purpose };
}

async function loadSourceConfig(request: ProjectBootstrapRequest): Promise<AdapterProjectConfig> {
	const catalog = createBuiltinCodemodCatalog();
	const adapter = catalog.registry.get(request.sourceAdapter);
	if (adapter === undefined)
		return {
			adapter: request.sourceAdapter,
			root: request.root,
			files: [],
			values: {},
		};
	const context: AdapterConfigContext = {
		file: "project",
		source: "",
		root: request.root,
		...(request.packageJson === undefined ? {} : { packageJson: request.packageJson }),
		readFile: request.readFile,
		listFiles: request.listFiles,
	};
	return adapter.loadConfigAsync === undefined
		? adapter.loadConfig(context)
		: await adapter.loadConfigAsync(context);
}

function loadGeneratedMeta(
	files: readonly AdapterGeneratedFile[],
	directory: string,
	tokens: Readonly<Record<string, Readonly<Record<string, string>>>> | undefined,
): PandwindMeta {
	const temp = mkdtempSync(join(tmpdir(), "pandwind-codemod-meta-"));
	try {
		for (const file of files) {
			if (!/\/(?:types\.d\.ts|tw\.ts|bridge\.ts|pandwind\.interop\.json)$/u.test(`/${file.path}`))
				continue;
			const output = resolve(temp, file.path.slice(directory.length + 1));
			const parent = dirname(output);
			if (parent !== temp) {
				// The support directory is flat today; keeping this branch makes the
				// temporary loader safe if a target later nests generated modules.
				mkdirSync(parent, { recursive: true });
			}
			writeFileSync(output, file.content);
		}
		return loadMetaFromSources({
			typesDtsPath: join(temp, "types.d.ts"),
			twTsPath: join(temp, "tw.ts"),
			bridgePath: join(temp, "bridge.ts"),
			interopPath: join(temp, "pandwind.interop.json"),
			tokens: tokens === undefined ? undefined : pandwindTokenGroups(tokens),
		});
	} finally {
		rmSync(temp, { recursive: true, force: true });
	}
}

/** Build project-owned Pandwind modules from the source adapter's evidence. */
export async function createPandwindProjectSupport(
	request: ProjectBootstrapRequest,
): Promise<PandwindProjectSupport> {
	const sourceConfig = await loadSourceConfig(request);
	const directory = posixPath(request.outputDirectory).replace(/\/$/u, "");
	const canonicalPandwindTarget = request.targetAdapter === CodemodAdapterId.Pandwind;
	const nextIntegration = isPandwindProjectTarget(request.targetAdapter)
		? planPandwindNextIntegration({
				projectRoot: request.root,
				outputDirectory: directory,
				fileSystem: {
					read: request.readFile,
					exists: (file) =>
						request
							.listFiles(request.root)
							.some((candidate) => resolve(request.root, candidate) === file),
				},
				...(request.packageJson === undefined ? {} : { packageJson: request.packageJson }),
			})
		: { enabled: false, fileChanges: [], notes: [] };
	const preset = projectFile(directory, "preset.ts");
	const runtimePreset = projectFile(directory, "preset.mjs");
	const css = projectFile(directory, "css.ts");
	const stack = projectFile(directory, "stack.tsx");
	const viteEnv = projectFile(directory, "vite-env.d.ts");
	const runtimeCss = projectFile(directory, "runtime.ts");
	const dss = projectFile(directory, "dss.ts");
	const cx = projectFile(directory, "cx.ts");
	const needsDssBinding = request.targetAdapter === SwapTargetId.Dss;
	const configurationFailed = (sourceConfig.residuals?.length ?? 0) > 0;
	const files: AdapterGeneratedFile[] = configurationFailed
		? []
		: [
				generatedFile(preset, presetSource(sourceConfig, {}), "Pandwind target preset"),
				...(nextIntegration.enabled
					? [
							generatedFile(
								runtimePreset,
								presetSource(sourceConfig, {}, false),
								"Next/Webpack runtime preset",
							),
						]
					: []),
				generatedFile(css, cssSource(nextIntegration.enabled), "shared extracted css() binding"),
				generatedFile(stack, stackSource(), "shared configured Stack binding"),
				generatedFile(viteEnv, viteEnvSource(), "Pandwind Vite virtual-module types"),
				generatedFile(runtimeCss, runtimeCssSource(), "shared runtime css() binding"),
				...(needsDssBinding
					? [generatedFile(dss, dssSource(), "shared design-system dss() binding")]
					: []),
				...(canonicalPandwindTarget ? [] : [generatedFile(cx, cxSource(), "shared cx() binding")]),
			];
	const derivedFiles: AdapterGeneratedFile[] = [];

	const cssEntry = sourceConfig.files.find((file) => file.endsWith(".css"));
	if (!configurationFailed && cssEntry !== undefined) {
		const stylesheet = request.readFile(cssEntry);
		if (stylesheet !== undefined) {
			const conditions = customVariantConditions(stylesheet);
			const presetFile = files.find((file) => file.path === preset)!;
			const withConditions = presetSource(sourceConfig, conditions);
			files[files.indexOf(presetFile)] = generatedFile(
				preset,
				withConditions,
				"Pandwind target preset",
			);
			const runtimePresetFile = files.find((file) => file.path === runtimePreset);
			if (runtimePresetFile !== undefined) {
				files[files.indexOf(runtimePresetFile)] = generatedFile(
					runtimePreset,
					presetSource(sourceConfig, conditions, false),
					"Next/Webpack runtime preset",
				);
			}
			const base = dirname(cssEntry);
			const generated = await generateDesignSystem(stylesheet, base);
			const bridge = await generateUtilityBridge(stylesheet, base, {
				props: BRIDGE_PROPS,
				values: scalarTokenValues(sourceConfig),
			});
			const types = projectFile(directory, "types.d.ts");
			const tw = projectFile(directory, "tw.ts");
			const bridgeFile = projectFile(directory, "bridge.ts");
			const theme = buildThemeBlock(sourceConfig.tokenCatalog?.groups ?? {});
			const interop = buildPandwindInteropArtifact({
				typesDts: generated.typesDts,
				twTs: generated.twTs,
				bridge,
				...(theme === "" ? {} : { themeBlock: theme }),
			});
			derivedFiles.push(
				generatedFile(types, generated.typesDts, "Tailwind-derived typed tw() metadata"),
				generatedFile(tw, generated.twTs, "Tailwind-derived tw() runtime"),
				generatedFile(
					bridgeFile,
					bridgeSource(bridge, generated.twTs, "./preset"),
					"Tailwind-derived css() utility bridge",
				),
				generatedFile(
					projectFile(directory, "pandwind.interop.json"),
					`${JSON.stringify(interop, null, "\t")}\n`,
					"versioned Pandwind interop artifact",
				),
			);
			if (theme !== "")
				derivedFiles.push(
					generatedFile(projectFile(directory, "pandwind-theme.css"), theme, "derived theme block"),
				);
		}
	}

	const outputFiles = canonicalPandwindTarget ? files : [...files, ...derivedFiles];
	const metaFiles = derivedFiles.some(
		(file) => file.path === projectFile(directory, "pandwind.interop.json"),
	)
		? derivedFiles
		: undefined;
	const hasGeneratedTw = derivedFiles.some((file) => file.path === projectFile(directory, "tw.ts"));
	const viteConfigChanges = rewritePandwindViteConfigs(request, sourceConfig, directory);
	const hostFileChanges: readonly HostFileChange[] = nextIntegration.fileChanges;
	const normalizedHostChanges = hostFileChanges.map((change) => ({
		...change,
		path: relative(request.root, change.path).replaceAll("\\", "/"),
	}));
	return {
		metaDirectory: directory,
		bindings: {
			...(configurationFailed
				? {}
				: {
						cssModule: css,
						stackModule: stack,
						runtimeCssModule: runtimeCss,
						...(canonicalPandwindTarget ? {} : { cxModule: cx }),
						...(needsDssBinding ? { dssModule: dss } : {}),
					}),
			...(configurationFailed || canonicalPandwindTarget || !hasGeneratedTw
				? {}
				: { twModule: projectFile(directory, "tw.ts") }),
		},
		files: outputFiles,
		fileChanges: [
			...rewriteTailwindStylesheets(request, sourceConfig),
			...removeTailwindStylesheetImports(request, sourceConfig),
			...removePandaStylesheetImports(request, sourceConfig),
			...removeUnoStylesheetImports(request, sourceConfig),
			...normalizedHostChanges,
			...viteConfigChanges,
			...enableTypeScriptExtensionImports(request, viteConfigChanges.length > 0),
		],
		...(metaFiles === undefined
			? {}
			: {
					meta: loadGeneratedMeta(metaFiles, directory, sourceConfig.tokenCatalog?.groups),
				}),
		sourceConfig,
	};
}
