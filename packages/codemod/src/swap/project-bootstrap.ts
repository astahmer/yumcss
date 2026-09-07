import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { buildPandwindInteropArtifact } from "pandwind/tw/interop";
import { generateUtilityBridge, BRIDGE_PROPS, type UtilityBridge } from "pandwind/codegen/bridge";
import { generateDesignSystem } from "pandwind/codegen/types";
import { buildThemeBlock } from "pandwind/codegen/theme";
import { extractTwConfig } from "pandwind/vite/inline";
import type {
	AdapterConfigContext,
	AdapterGeneratedFile,
	AdapterProjectConfig,
	AdapterProjectBindings,
} from "./adapter-contract.ts";
import type { PandwindMeta } from "../meta.ts";
import { loadMetaFromSources } from "../meta.ts";
import { createBuiltinCodemodCatalog } from "./adapter-catalog.ts";
import { CodemodAdapterId } from "./identifiers.ts";

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

const projectFile = (directory: string, name: string): string =>
	posixPath(join(directory.replaceAll("\\", "/"), name));

const scalarTokenValues = (config: AdapterProjectConfig): Set<string> =>
	new Set(
		Object.values(config.tokenCatalog?.groups ?? {}).flatMap((group) => Object.values(group)),
	);

const TOKEN_PROPERTIES = {
	colors: [
		"color",
		"background",
		"backgroundColor",
		"borderColor",
		"borderTopColor",
		"borderRightColor",
		"borderBottomColor",
		"borderLeftColor",
		"outlineColor",
		"textDecorationColor",
		"textEmphasisColor",
		"fill",
		"stroke",
	],
	spacing: [
		"gap",
		"rowGap",
		"columnGap",
		"padding",
		"paddingTop",
		"paddingRight",
		"paddingBottom",
		"paddingLeft",
		"paddingInline",
		"paddingInlineStart",
		"paddingInlineEnd",
		"paddingBlock",
		"paddingBlockStart",
		"paddingBlockEnd",
		"margin",
		"marginTop",
		"marginRight",
		"marginBottom",
		"marginLeft",
		"marginInline",
		"marginInlineStart",
		"marginInlineEnd",
		"marginBlock",
		"marginBlockStart",
		"marginBlockEnd",
		"top",
		"right",
		"bottom",
		"left",
		"inset",
		"insetInline",
		"insetInlineStart",
		"insetInlineEnd",
		"insetBlock",
		"insetBlockStart",
		"insetBlockEnd",
		"width",
		"minWidth",
		"maxWidth",
		"height",
		"minHeight",
		"maxHeight",
	],
	radii: [
		"borderRadius",
		"borderTopLeftRadius",
		"borderTopRightRadius",
		"borderBottomRightRadius",
		"borderBottomLeftRadius",
	],
	fonts: ["fontFamily"],
	fontSizes: ["fontSize"],
	fontWeights: ["fontWeight"],
	lineHeights: ["lineHeight"],
	letterSpacings: ["letterSpacing"],
	shadows: ["boxShadow", "textShadow"],
	zIndices: ["zIndex"],
} as const satisfies Readonly<Record<string, readonly string[]>>;

function presetPropertiesSource(
	groups: Readonly<Record<string, Readonly<Record<string, string>>>>,
): string {
	const properties: Record<string, { $tokens: string } | true> = { $all: true };
	for (const [group, names] of Object.entries(TOKEN_PROPERTIES)) {
		if (groups[group] === undefined) continue;
		for (const property of names) properties[property] = { $tokens: group };
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
				Object.entries(values).map(([key, value]) => [
					`$${key.replace(/^\$/u, "").replaceAll(".", "-")}`,
					value,
				]),
			),
		]),
	);
}

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
	const cssEntry = config.files.find((file) => /\.css$/u.test(file));
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
	for (const file of config.files.filter((candidate) => /\.css$/u.test(candidate))) {
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
		} else {
			if (source.includes("pandwindCssVite(")) continue;
			const withImports =
				`import { pandwindCssVite } from "pandwind/vite";\nimport { pandwindPreset } from "${typedPresetSpecifier}";\n` +
				source;
			if (/\bplugins\s*:\s*\[\s*\]/u.test(withImports)) {
				next = withImports.replace(
					/(\bplugins\s*:\s*)\[\s*\]/u,
					`$1[${pandwindPlugin}]`,
				);
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
	conditions: Readonly<Record<string, string>>,
): string {
	const sourceTokens = config.tokenCatalog?.groups ?? {};
	const tokens = pandwindTokenGroups(sourceTokens);
	return `import { definePreset } from "pandwind/preset";

export const pandwindPreset = definePreset(
	{
		config: {} as import("pandwind/preset").AnyCssConfig,
		tokens: ${JSON.stringify(tokens, null, "\t")},
	},
	{
		strict: true,
		conditions: ${JSON.stringify(conditions, null, "\t")},
		properties: ${presetPropertiesSource(sourceTokens)},
	},
);
`;
}

function cssSource(): string {
	return `/// <reference path="./vite-env.d.ts" />
import "pandwind:css";
import { createCss } from "pandwind/css";
import { pandwindPreset } from "./preset";

export const css = createCss(pandwindPreset);
`;
}

function viteEnvSource(): string {
	return `/// <reference types="vite/client" />

/** Virtual CSS module served by \`pandwindCssVite\`. */
declare module "pandwind:css";
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
	const preset = projectFile(directory, "preset.ts");
	const css = projectFile(directory, "css.ts");
	const viteEnv = projectFile(directory, "vite-env.d.ts");
	const runtimeCss = projectFile(directory, "runtime.ts");
	const dss = projectFile(directory, "dss.ts");
	const cx = projectFile(directory, "cx.ts");
	const configurationFailed = (sourceConfig.residuals?.length ?? 0) > 0;
	const files: AdapterGeneratedFile[] = configurationFailed
		? []
		: [
				generatedFile(preset, presetSource(sourceConfig, {}), "Pandwind target preset"),
				generatedFile(css, cssSource(), "shared extracted css() binding"),
				generatedFile(viteEnv, viteEnvSource(), "Pandwind Vite virtual-module types"),
				generatedFile(runtimeCss, runtimeCssSource(), "shared runtime css() binding"),
				generatedFile(dss, dssSource(), "shared design-system dss() binding"),
				generatedFile(cx, cxSource(), "shared cx() binding"),
			];

	const cssEntry = sourceConfig.files.find((file) => /\.css$/u.test(file));
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
				artifactDir: directory,
				...(theme === "" ? {} : { themeBlock: theme }),
			});
			files.push(
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
				files.push(
					generatedFile(projectFile(directory, "pandwind-theme.css"), theme, "derived theme block"),
				);
		}
	}

	const metaFiles = files.some(
		(file) => file.path === projectFile(directory, "pandwind.interop.json"),
	)
		? files
		: undefined;
	const hasGeneratedTw = files.some((file) => file.path === projectFile(directory, "tw.ts"));
	const viteConfigChanges = rewritePandwindViteConfigs(request, sourceConfig, directory);
	return {
		metaDirectory: directory,
		bindings: {
			...(configurationFailed
				? {}
				: { cssModule: css, runtimeCssModule: runtimeCss, dssModule: dss, cxModule: cx }),
			...(configurationFailed || !hasGeneratedTw
				? {}
				: { twModule: projectFile(directory, "tw.ts") }),
		},
		files,
		fileChanges: [
			...rewriteTailwindStylesheets(request, sourceConfig),
			...removeTailwindStylesheetImports(request, sourceConfig),
			...viteConfigChanges,
			...enableTypeScriptExtensionImports(request, viteConfigChanges.length > 0),
		],
		...(metaFiles === undefined ? {} : { meta: loadGeneratedMeta(metaFiles, directory) }),
		sourceConfig,
	};
}
