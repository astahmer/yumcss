/**
 * Host-app Panda theme ingestion.
 *
 * Loads a panda.config.ts via dynamic import (same mechanism as the
 * definePreset importer in token-set.ts) and flattens the pieces the
 * panda inbound parser needs:
 *
 * - semanticTokens / tokens -> known token PATHS (`fg.muted`, `neutral.700`)
 *   plus the generated CSS-var name each maps to (`--colors-fg-muted`) for
 *   the CSS-variable fallback;
 * - textStyles -> name -> plain declaration object, expanded inline by the
 *   parser (a textStyle is bundled utilities);
 * - utilities -> the effective project shorthand/property vocabulary.
 *
 * Nothing here resolves conditional `{ base, _dark }` VALUES — references
 * stay symbolic so dark-mode switching survives migration (pass 1 lifts the
 * tokens themselves into a pandwind preset).
 */
import { SourcePass } from "../../../source-pass-utils.ts";
import { dirnameDocumentPath, joinDocumentPath } from "../../../path-utils.ts";
import { parseObjectLiteral, literalToPlain } from "./parse.ts";
import {
	NODE_PROJECT_MODULE_LOADER,
	type ProjectModuleLoader,
} from "../../project-module-loader.ts";
import { TokenCatalog } from "../../tokens.ts";
import type { AdapterTokenCatalog } from "../../adapter-contract.ts";
import { PandaUtilityCatalog } from "./utilities.ts";
import {
	PandaJsxStylePropsModeTag,
	normalizePandaStylePropsMode,
	resolvePandaStylePropContract,
	type PandaStylePropContract,
} from "./style-props.ts";
import { pandaImportMapFromSource, pandaOutdirFromSource } from "./source-modules.ts";

interface PandaCustomPattern {
	/** Runtime transform from pattern props to a style object. */
	transform?: (
		props: Record<string, unknown>,
		helpers: Record<string, unknown>,
	) => Record<string, unknown>;
	defaultValues?: Record<string, unknown>;
}

export interface PandaColorPaletteOptions {
	readonly enabled?: boolean;
	readonly include?: readonly string[];
	readonly exclude?: readonly string[];
}

export interface PandaTheme {
	/** Flattened Panda token groups, preserving conditional semantic values. */
	tokens: Record<string, Record<string, unknown>>;
	/** Panda condition names and their selector/media-query values. */
	conditions: Record<string, string | string[]>;
	/** Known token reference paths -> generated CSS custom property name. */
	tokenVars: ReadonlyMap<string, string>;
	/** Color-token roots that Panda exposes through `colorPalette.*`. */
	readonly colorPalettes?: ReadonlyMap<string, string>;
	/** Panda's color-palette generation policy, when configured. */
	readonly colorPalette?: PandaColorPaletteOptions;
	/** textStyle name -> plain declaration object (the `.value` payload). */
	textStyles: ReadonlyMap<string, Record<string, unknown>>;
	/** Custom pattern definitions loaded from panda.config.ts. */
	customPatterns: ReadonlyMap<string, PandaCustomPattern>;
	/** Utility/shorthand vocabulary from Panda's effective config. */
	readonly utilityCatalog: PandaUtilityCatalog;
	/** Configured plugin values retained for evidence; opaque values stay unresolved. */
	readonly plugins?: readonly unknown[];
	/** Normalized string-valued tokens for downstream target policies. */
	readonly tokenCatalog?: AdapterTokenCatalog;
	/** Set when the official config loader failed and the deterministic fallback was used. */
	readonly officialConfigError?: string;
	/** Effective JSX style-prop contract, sourced from Panda or generated types. */
	readonly jsxStyleProps: PandaStylePropContract;
	/** Effective generated-system output directory, when configured. */
	readonly outdir?: string;
	/** Panda's configured generated-system import map, when configured. */
	readonly importMap?: unknown;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v);

function flattenTokenSection(
	node: Record<string, unknown>,
	group: string,
	prefix: string[],
	out: Record<string, Record<string, unknown>>,
): void {
	const stack: Array<{ node: Record<string, unknown>; prefix: string[] }> = [{ node, prefix }];
	while (stack.length > 0) {
		const current = stack.pop()!;
		const entries = Object.entries(current.node);
		for (let index = entries.length - 1; index >= 0; index--) {
			const [key, child] = entries[index]!;
			if (!isPlainObject(child)) continue;
			const nextPrefix = current.prefix.concat(key === "DEFAULT" ? [] : [key]);
			if ("value" in child) {
				const path = nextPrefix.join(".");
				if (path !== "") (out[group] ??= {})[path] = child.value;
				continue;
			}
			stack.push({ node: child, prefix: nextPrefix });
		}
	}
}

function collectTokenValues(section: unknown, out: Record<string, Record<string, unknown>>): void {
	if (!isPlainObject(section)) return;
	for (const [group, values] of Object.entries(section)) {
		if (isPlainObject(values)) flattenTokenSection(values, group, [], out);
	}
}

const normalizeTokenReferences = (tokens: Record<string, Record<string, unknown>>): void => {
	type Task = {
		readonly value: unknown;
		readonly assign: (value: unknown) => void;
	};
	for (const values of Object.values(tokens)) {
		for (const [key, value] of Object.entries(values)) {
			const stack: Task[] = [{ value, assign: (result) => (values[key] = result) }];
			while (stack.length > 0) {
				const task = stack.pop()!;
				if (typeof task.value === "string") {
					const reference = /^\{([^}]+)\}$/.exec(task.value)?.[1];
					task.assign(reference ?? task.value);
					continue;
				}
				if (Array.isArray(task.value)) {
					const output: unknown[] = [];
					task.assign(output);
					for (let index = task.value.length - 1; index >= 0; index--) {
						const child = task.value[index]!;
						stack.push({
							value: child,
							assign: (result) => (output[index] = result),
						});
					}
					continue;
				}
				if (isPlainObject(task.value)) {
					const output: Record<string, unknown> = {};
					task.assign(output);
					for (const [childKey, child] of Object.entries(task.value).toReversed()) {
						stack.push({
							value: child,
							assign: (result) => (output[childKey] = result),
						});
					}
					continue;
				}
				task.assign(task.value);
			}
		}
	}
};

/** Traverse a Panda token tree until `{ value: ... }` leaves; collect paths. */
const dashSegment = (segment: string): string =>
	segment.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

const matchesPattern = (pattern: string, value: string): boolean => {
	const wildcard = "\u0000";
	const source = pattern
		.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
		.replace(/\*\*/g, wildcard)
		.replace(/\*/g, "[^.]*")
		.replaceAll(wildcard, ".*")
		.replace(/\?/g, "[^.]");
	return new RegExp(`^${source}$`, "u").test(value);
};

const normalizeColorPaletteOptions = (value: unknown): PandaColorPaletteOptions | undefined => {
	if (!isPlainObject(value)) return undefined;
	const include = Array.isArray(value.include)
		? value.include.filter((item): item is string => typeof item === "string")
		: undefined;
	const exclude = Array.isArray(value.exclude)
		? value.exclude.filter((item): item is string => typeof item === "string")
		: undefined;
	const enabled = typeof value.enabled === "boolean" ? value.enabled : undefined;
	if (enabled === undefined && include === undefined && exclude === undefined) return undefined;
	return {
		...(enabled === undefined ? {} : { enabled }),
		...(include === undefined ? {} : { include }),
		...(exclude === undefined ? {} : { exclude }),
	};
};

const colorPaletteOptionsFromSource = (source: string): PandaColorPaletteOptions | undefined => {
	for (const match of source.matchAll(/\bcolorPalette\s*:\s*\{/g)) {
		const open = (match.index ?? 0) + match[0].length - 1;
		const block = SourcePass.matchBlock(source, open);
		if (block === null) continue;
		const parsed = parseObjectLiteral(block.body);
		const plain = parsed === null ? undefined : literalToPlain(parsed);
		const options = normalizeColorPaletteOptions(plain);
		if (options !== undefined) return options;
	}
	return undefined;
};

export const collectPandaColorPalettes = (
	tokens: Record<string, Record<string, unknown>>,
	options?: PandaColorPaletteOptions,
): ReadonlyMap<string, string> => {
	if (options?.enabled === false) return new Map();
	const colors = tokens.colors;
	if (colors === undefined) return new Map();
	const palettes = new Map<string, string>();
	for (const tokenPath of Object.keys(colors)) {
		const segments = tokenPath.split(".");
		const colorPath = segments.length > 1 ? segments.slice(0, -1) : segments;
		const colorPathString = colorPath.join(".");
		if (options?.exclude?.some((pattern) => matchesPattern(pattern, colorPathString))) continue;
		if (
			options?.include !== undefined &&
			options.include.length > 0 &&
			!options.include.some((pattern) => matchesPattern(pattern, colorPathString))
		)
			continue;
		for (let index = 1; index <= colorPath.length; index++) {
			const root = colorPath.slice(0, index).join(".");
			palettes.set(root, `colors.${root}`);
		}
	}
	return palettes;
};

const addPandaColorPaletteTokenVars = (
	tokens: Record<string, Record<string, unknown>>,
	colorPalettes: ReadonlyMap<string, string>,
	tokenVars: Map<string, string>,
): void => {
	const colors = tokens.colors;
	if (colors === undefined) return;
	for (const tokenPath of Object.keys(colors)) {
		const segments = tokenPath.split(".");
		const colorPath = segments.length > 1 ? segments.slice(0, -1) : segments;
		for (const root of colorPalettes.keys()) {
			const rootSegments = root.split(".");
			if (rootSegments.some((segment, index) => colorPath[index] !== segment)) continue;
			const suffix = segments.slice(rootSegments.length).join(".");
			const virtualPath = suffix ? `colorPalette.${suffix}` : "colorPalette";
			const virtualVar = suffix
				? `--colors-color-palette-${suffix.split(".").map(dashSegment).join("-")}`
				: "--colors-color-palette";
			tokenVars.set(virtualPath, virtualVar);
		}
	}
};

function collectTokenPaths(
	node: Record<string, unknown>,
	prefix: string[],
	group: string | null,
	out: Map<string, string>,
): void {
	const stack: Array<{
		node: Record<string, unknown>;
		prefix: string[];
		group: string | null;
	}> = [{ node, prefix, group }];
	while (stack.length > 0) {
		const current = stack.pop()!;
		const entries = Object.entries(current.node);
		for (let index = entries.length - 1; index >= 0; index--) {
			const [key, child] = entries[index]!;
			if (!isPlainObject(child)) continue;
			if ("value" in child) {
				const segments = current.prefix.concat(key === "DEFAULT" ? [] : [key]);
				if (segments.length === 0) continue;
				const path = segments.join(".");
				const dashed = segments.map(dashSegment).join("-");
				const varGroup = current.group === null ? "" : `${dashSegment(current.group)}-`;
				out.set(path, `--${varGroup}${dashed}`);
				continue;
			}
			// First nesting level names the GROUP; paths are relative to it.
			const nextPrefix =
				key === "DEFAULT"
					? current.prefix
					: current.group === null
						? []
						: current.prefix.concat(key);
			stack.push({ node: child, prefix: nextPrefix, group: current.group ?? key });
		}
	}
}

/** Traverse textStyles until `{ value: <declarations> }` leaves. */
function collectTextStyles(
	node: Record<string, unknown>,
	prefix: string[],
	out: Map<string, Record<string, unknown>>,
): void {
	const stack: Array<{ node: Record<string, unknown>; prefix: string[] }> = [{ node, prefix }];
	while (stack.length > 0) {
		const current = stack.pop()!;
		const entries = Object.entries(current.node);
		for (let index = entries.length - 1; index >= 0; index--) {
			const [key, child] = entries[index]!;
			if (!isPlainObject(child)) continue;
			const nextPrefix = current.prefix.concat(key);
			if ("value" in child && isPlainObject(child.value)) {
				out.set(nextPrefix.join("."), child.value);
				continue;
			}
			stack.push({ node: child, prefix: nextPrefix });
		}
	}
}

type AnyModule = Record<string, unknown>;

interface PandaConfigShape {
	presets?: unknown;
	plugins?: unknown;
	theme?: { extend?: Record<string, unknown>; tokens?: Record<string, unknown> } & Record<
		string,
		unknown
	>;
	conditions?: { extend?: Record<string, unknown> } & Record<string, unknown>;
	utilities?: { extend?: Record<string, unknown> } & Record<string, unknown>;
	patterns?: { extend?: Record<string, unknown> } & Record<string, unknown>;
	default?: PandaConfigShape;
	jsxStyleProps?: "all" | "minimal" | "none";
	outdir?: string;
	importMap?: unknown;
}

async function importModule(path: string): Promise<AnyModule> {
	const { pathToFileURL } = await import(/* @vite-ignore */ "node:url");
	return (await import(pathToFileURL(path).href)) as AnyModule;
}

async function createDefaultReadFile(): Promise<(file: string) => string | undefined> {
	const { createSourceWorkspace } = await import(/* @vite-ignore */ "pandwind/source/workspace");
	const workspace = createSourceWorkspace();
	return (file) => workspace.read([file])[0]?.source;
}

/** Load semanticTokens/tokens/textStyles from a host panda.config.ts. */
export async function loadPandaTheme(
	configPath: string,
	loader: ProjectModuleLoader = NODE_PROJECT_MODULE_LOADER,
	readFile?: (file: string) => string | undefined,
): Promise<PandaTheme> {
	const read = readFile ?? (await createDefaultReadFile());
	try {
		const official = await loadPandaThemeByOfficialPackage(configPath, loader);
		if (official !== undefined) return withPandaStyleProps(official, configPath, loader, read);
	} catch (error) {
		const fallback = await loadPandaThemeByImport(configPath).catch(() =>
			loadPandaThemeFromDisk(configPath, read),
		);
		return withPandaStyleProps(
			{
				...fallback,
				officialConfigError: error instanceof Error ? error.message : String(error),
			},
			configPath,
			loader,
			read,
		);
	}
	try {
		return withPandaStyleProps(await loadPandaThemeByImport(configPath), configPath, loader, read);
	} catch {
		return withPandaStyleProps(loadPandaThemeFromDisk(configPath, read), configPath, loader, read);
	}
}

async function withPandaStyleProps(
	theme: PandaTheme,
	configPath: string,
	loader: ProjectModuleLoader,
	readFile: (file: string) => string | undefined,
): Promise<PandaTheme> {
	return {
		...theme,
		jsxStyleProps: await resolvePandaStylePropContract(
			configPath,
			{ jsxStyleProps: theme.jsxStyleProps.mode, outdir: theme.outdir },
			[...theme.utilityCatalog.utilityNames],
			Object.keys(theme.conditions),
			loader,
			readFile,
		),
	};
}

async function loadPandaThemeByOfficialPackage(
	configPath: string,
	loader: ProjectModuleLoader,
): Promise<PandaTheme | undefined> {
	const packageModule = await loader.importPackage<{
		loadConfig?: (options: { cwd: string; file: string }) => Promise<{ config: PandaConfigShape }>;
	}>("@pandacss/config", dirnameDocumentPath(configPath));
	if (packageModule?.loadConfig === undefined) return undefined;
	try {
		const result = await packageModule.loadConfig({
			cwd: dirnameDocumentPath(configPath),
			file: configPath,
		});
		// The official loader returns Panda's effective config, including preset and
		// plugin decisions. Never inject built-in values on top of that result:
		// an explicit `presets: []` or feature-removing plugin must remain authoritative.
		return pandaThemeFromConfig(result.config);
	} catch (error) {
		throw new Error(
			`official Panda config loading failed: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error },
		);
	}
}

async function loadPandaThemeByImport(configPath: string): Promise<PandaTheme> {
	const mod = await importModule(configPath);
	const config = (mod.default ?? Object.values(mod)[0]) as PandaConfigShape | undefined;
	// tsx can wrap an ESM default export one extra time when the imported
	// config is compiled as CommonJS. Unwrap that boundary before inspecting
	// Panda's theme; otherwise custom project context is silently missed.
	const unwrapped = config?.default ?? config;
	return pandaThemeFromConfig(unwrapped);
}

function pandaThemeFromConfig(unwrapped: PandaConfigShape | undefined): PandaTheme {
	const theme = unwrapped?.theme ?? {};
	const extend = theme.extend ?? theme;
	const colorPalette = normalizeColorPaletteOptions(extend.colorPalette ?? theme.colorPalette);
	const tokens: Record<string, Record<string, unknown>> = {};
	collectTokenValues(extend.tokens, tokens);
	collectTokenValues(extend.semanticTokens, tokens);
	normalizeTokenReferences(tokens);
	const conditions: Record<string, string | string[]> = {};
	const conditionConfig = unwrapped?.conditions?.extend ?? unwrapped?.conditions;
	if (isPlainObject(conditionConfig)) {
		for (const [key, value] of Object.entries(conditionConfig)) {
			if (typeof value === "string" || Array.isArray(value))
				conditions[key] = value as string | string[];
		}
	}
	if (isPlainObject(extend.breakpoints)) {
		for (const [key, value] of Object.entries(extend.breakpoints)) {
			if (typeof value === "string") conditions[key] = `@media (min-width: ${value})`;
		}
	}
	const tokenVars = new Map<string, string>();
	for (const key of ["semanticTokens", "tokens"] as const) {
		const section = extend[key];
		if (isPlainObject(section)) collectTokenPaths(section, [], null, tokenVars);
	}
	const colorPalettes = collectPandaColorPalettes(tokens, colorPalette);
	addPandaColorPaletteTokenVars(tokens, colorPalettes, tokenVars);
	const textStyles = new Map<string, Record<string, unknown>>();
	const tsSection = extend["textStyles"];
	if (isPlainObject(tsSection)) collectTextStyles(tsSection, [], textStyles);
	const utilityCatalog = PandaUtilityCatalog.fromConfig(unwrapped?.utilities);
	const customPatterns = new Map<string, PandaCustomPattern>();
	const patternSection = unwrapped?.patterns?.extend ?? unwrapped?.patterns;
	if (isPlainObject(patternSection)) {
		for (const [name, raw] of Object.entries(patternSection)) {
			if (!isPlainObject(raw)) continue;
			const transform = raw.transform;
			const defaults = isPlainObject(raw.defaultValues) ? raw.defaultValues : undefined;
			if (typeof transform === "function" || defaults !== undefined) {
				customPatterns.set(name, {
					transform:
						typeof transform === "function"
							? (transform as PandaCustomPattern["transform"])
							: undefined,
					defaultValues: defaults,
				});
			}
		}
	}
	return {
		tokens,
		conditions,
		tokenVars,
		colorPalettes,
		...(colorPalette === undefined ? {} : { colorPalette }),
		textStyles,
		customPatterns,
		utilityCatalog,
		plugins: Array.isArray(unwrapped?.plugins) ? unwrapped.plugins : undefined,
		tokenCatalog: TokenCatalog.fromNested(tokens)?.contract,
		jsxStyleProps: {
			mode: normalizePandaStylePropsMode(unwrapped?.jsxStyleProps),
			evidence: ["config"],
			matches: () => false,
		},
		...(unwrapped?.outdir === undefined ? {} : { outdir: unwrapped.outdir }),
		...(unwrapped?.importMap === undefined ? {} : { importMap: unwrapped.importMap }),
	};
}

/**
 * Offline loader: reads the config + sibling theme files and extracts the
 * sections from source text (no module evaluation, no deps required).
 */
function loadPandaThemeFromDisk(
	configPath: string,
	readFile: (file: string) => string | undefined,
): PandaTheme {
	const dir = dirnameDocumentPath(configPath);
	const configSource = readFile(configPath);
	if (configSource === undefined) return emptyPandaTheme;
	const extra: Array<string> = [];
	// follow local `import { x } from './y'` references used by the sections
	for (const m of configSource.matchAll(/import\s+\{([^}]*)\}\s+from\s+["']\.\/([^"']+)["']/g)) {
		const names = m[1]!
			.split(",")
			.map((n) => n.trim().split(/\s+as\s+/)[0]!)
			.filter(Boolean);
		void names;
		const candidate = joinDocumentPath(dir, `${m[2]}.ts`);
		const source = readFile(candidate);
		if (source !== undefined) extra.push(source);
	}
	const mode = /\bjsxStyleProps\s*:\s*["'](all|minimal|none)["']/u.exec(configSource)?.[1] as
		| PandaJsxStylePropsModeTag
		| undefined;
	const outdir = pandaOutdirFromSource(configSource);
	const colorPalette = colorPaletteOptionsFromSource(configSource);
	return loadPandaThemeFromSource(configSource, extra, {
		mode,
		outdir,
		importMap: pandaImportMapFromSource(configSource),
		...(colorPalette === undefined ? {} : { colorPalette }),
	});
}

/** Empty theme — every token candidate falls back to verbatim/CSS-var. */
export const emptyPandaTheme: PandaTheme = {
	tokens: {},
	conditions: {},
	tokenVars: new Map(),
	textStyles: new Map(),
	customPatterns: new Map(),
	utilityCatalog: PandaUtilityCatalog.empty(),
	plugins: [],
	jsxStyleProps: {
		mode: PandaJsxStylePropsModeTag.All,
		evidence: ["fallback"],
		matches: () => false,
	},
};

/* ------------------------------------------------------------------ */
/* offline fallback (host deps not installed)                          */
/* ------------------------------------------------------------------ */

/**
 * Extract semanticTokens/tokens/textStyles straight from source text when
 * the host's panda.config.ts cannot be imported (@pandacss/dev not
 * installed). The theme files are plain literals behind identity helpers,
 * so brace-balanced slicing + the shared literal parser recovers them.
 */
function loadPandaThemeFromSource(
	configSource: string,
	extraSources: Array<string>,
	options: {
		readonly mode?: PandaJsxStylePropsModeTag;
		readonly outdir?: string;
		readonly importMap?: unknown;
		readonly colorPalette?: PandaColorPaletteOptions;
	} = {},
): PandaTheme {
	const tokenVars = new Map<string, string>();
	const tokens: Record<string, Record<string, unknown>> = {};
	const textStyles = new Map<string, Record<string, unknown>>();
	const conditions: Record<string, string | string[]> = {};
	let utilityCatalog = PandaUtilityCatalog.empty();
	const chunks: Array<string> = [configSource, ...extraSources];
	for (const chunk of chunks) {
		for (const m of chunk.matchAll(
			/(?:conditions)\s*[:=]\s*(?:defineConditions)?\s*(?:\(\s*)?\{/g,
		)) {
			const open = (m.index ?? 0) + m[0].length - 1;
			const block = SourcePass.matchBlock(chunk, open);
			if (block === null) continue;
			const parsed = parseObjectLiteral(block.body);
			const plain = parsed === null ? undefined : literalToPlain(parsed);
			if (!isPlainObject(plain)) continue;
			const configured = isPlainObject(plain.extend) ? plain.extend : plain;
			for (const [name, value] of Object.entries(configured)) {
				if (typeof value === "string") conditions[name] = value;
				else if (Array.isArray(value) && value.every((item) => typeof item === "string"))
					conditions[name] = value as string[];
			}
		}
		for (const m of chunk.matchAll(
			/(?:semanticTokens|tokens|textStyles|utilities)\s*[:=]\s*(?:defineSemanticTokens|defineTokens|defineTextStyles|defineUtility)?\s*(?:\(\s*)?\{/g,
		)) {
			const section = /^(\w+)/.exec(m[0].trim())?.[1] ?? "";
			const open = (m.index ?? 0) + m[0].length - 1;
			const block = SourcePass.matchBlock(chunk, open);
			if (block === null) continue;
			const parsed = parseObjectLiteral(block.body);
			if (parsed === null) continue;
			const plain = literalToPlain(parsed);
			if (!isPlainObject(plain)) continue;
			if (section === "textStyles") {
				collectTextStyles(plain, [], textStyles);
			} else if (section === "utilities") {
				utilityCatalog = PandaUtilityCatalog.fromConfig(plain);
			} else {
				// top-level keys are the panda groups (colors, shadows…)
				for (const [group, subtree] of Object.entries(plain)) {
					if (!isPlainObject(subtree)) continue;
					flattenTokenSection(subtree, group, [], tokens);
					collectTokenPaths({ [group]: subtree }, [], null, tokenVars);
				}
			}
		}
	}
	normalizeTokenReferences(tokens);
	const colorPalettes = collectPandaColorPalettes(tokens, options.colorPalette);
	addPandaColorPaletteTokenVars(tokens, colorPalettes, tokenVars);
	return {
		tokens,
		conditions,
		tokenVars,
		colorPalettes,
		...(options.colorPalette === undefined ? {} : { colorPalette: options.colorPalette }),
		textStyles,
		customPatterns: new Map(),
		utilityCatalog,
		plugins: [],
		tokenCatalog: TokenCatalog.fromNested(tokens)?.contract,
		jsxStyleProps: {
			mode: options.mode ?? PandaJsxStylePropsModeTag.All,
			evidence: ["fallback"],
			matches: () => false,
		},
		...(options.outdir === undefined ? {} : { outdir: options.outdir }),
		...(options.importMap === undefined ? {} : { importMap: options.importMap }),
	};
}
