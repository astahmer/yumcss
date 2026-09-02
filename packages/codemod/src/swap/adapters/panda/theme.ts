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
 *   parser (a textStyle is bundled utilities).
 *
 * Nothing here resolves conditional `{ base, _dark }` VALUES — references
 * stay symbolic so dark-mode switching survives migration (pass 1 lifts the
 * tokens themselves into a pandwind preset).
 */
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { SourcePass } from "../../../source-pass-utils.ts";
import { parseObjectLiteral, literalToPlain } from "./parse.ts";
import {
	NODE_PROJECT_MODULE_LOADER,
	type ProjectModuleLoader,
} from "../../project-module-loader.ts";
import { createSourceWorkspace } from "pandwind/source/workspace";
import { TokenCatalog } from "../../tokens.ts";
import type { AdapterTokenCatalog } from "../../adapter-contract.ts";

const sourceWorkspace = createSourceWorkspace();

interface PandaCustomPattern {
	/** Runtime transform from pattern props to a style object. */
	transform?: (
		props: Record<string, unknown>,
		helpers: Record<string, unknown>,
	) => Record<string, unknown>;
	defaultValues?: Record<string, unknown>;
}

export interface PandaTheme {
	/** Flattened Panda token groups, preserving conditional semantic values. */
	tokens: Record<string, Record<string, unknown>>;
	/** Panda condition names and their selector/media-query values. */
	conditions: Record<string, string | string[]>;
	/** Known token reference paths -> generated CSS custom property name. */
	tokenVars: ReadonlyMap<string, string>;
	/** textStyle name -> plain declaration object (the `.value` payload). */
	textStyles: ReadonlyMap<string, Record<string, unknown>>;
	/** Custom pattern definitions loaded from panda.config.ts. */
	customPatterns: ReadonlyMap<string, PandaCustomPattern>;
	/** Configured plugin values retained for evidence; opaque values stay unresolved. */
	readonly plugins?: readonly unknown[];
	/** Normalized string-valued tokens for downstream target policies. */
	readonly tokenCatalog?: AdapterTokenCatalog;
	/** Set when the official config loader failed and the deterministic fallback was used. */
	readonly officialConfigError?: string;
}

interface ValueBox {
	value?: unknown;
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
			const box = child as ValueBox;
			const nextPrefix = current.prefix.concat(key === "DEFAULT" ? [] : [key]);
			if ("value" in box) {
				const path = nextPrefix.join(".");
				if (path !== "") (out[group] ??= {})[path] = box.value;
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

function resolveTokenReferences(tokens: Record<string, Record<string, unknown>>): void {
	const resolving = new Set<string>();
	type Task =
		| { readonly kind: "value"; readonly value: unknown; readonly assign: (value: unknown) => void }
		| { readonly kind: "leave"; readonly id: string };
	const resolve = (value: unknown, assign: (result: unknown) => void): void => {
		const stack: Task[] = [{ kind: "value", value, assign }];
		while (stack.length > 0) {
			const task = stack.pop()!;
			if (task.kind === "leave") {
				resolving.delete(task.id);
				continue;
			}
			if (typeof task.value === "string") {
				const ref = /^\{([^}]+)\}$/.exec(task.value)?.[1];
				const dot = ref?.indexOf(".") ?? -1;
				if (ref === undefined || dot === -1) {
					task.assign(task.value);
					continue;
				}
				const group = ref.slice(0, dot);
				const key = ref.slice(dot + 1);
				const id = `${group}.${key}`;
				const candidate = tokens[group]?.[key];
				if (candidate === undefined || resolving.has(id)) {
					task.assign(task.value);
					continue;
				}
				resolving.add(id);
				stack.push({ kind: "leave", id });
				stack.push({ kind: "value", value: candidate, assign: task.assign });
				continue;
			}
			if (Array.isArray(task.value)) {
				const output: unknown[] = [];
				task.assign(output);
				for (let index = task.value.length - 1; index >= 0; index--) {
					const child = task.value[index]!;
					stack.push({
						kind: "value",
						value: child,
						assign: (result) => (output[index] = result),
					});
				}
				continue;
			}
			if (isPlainObject(task.value)) {
				const output: Record<string, unknown> = {};
				task.assign(output);
				for (const [key, child] of Object.entries(task.value).toReversed()) {
					stack.push({
						kind: "value",
						value: child,
						assign: (result) => (output[key] = result),
					});
				}
				continue;
			}
			task.assign(task.value);
		}
	};
	for (const values of Object.values(tokens)) {
		for (const [key, value] of Object.entries(values))
			resolve(value, (result) => (values[key] = result));
	}
}

/** Traverse a Panda token tree until `{ value: ... }` leaves; collect paths. */
const dashSegment = (segment: string): string =>
	segment.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

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
			const box = child as ValueBox;
			if ("value" in box) {
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
			const box = child as ValueBox;
			const nextPrefix = current.prefix.concat(key);
			if ("value" in box && isPlainObject(box.value)) {
				out.set(nextPrefix.join("."), box.value);
				continue;
			}
			stack.push({ node: child, prefix: nextPrefix });
		}
	}
}

// These are supplied by Panda's built-in preset even when a project only
// declares custom text styles in panda.config.ts.
const DEFAULT_PANDA_TEXT_STYLES: Record<string, Record<string, unknown>> = {
	xs: { fontSize: "0.75rem", lineHeight: "calc(1 / 0.75)" },
	sm: { fontSize: "0.875rem", lineHeight: "calc(1.25 / 0.875)" },
	md: { fontSize: "1rem", lineHeight: "calc(1.5 / 1)" },
	lg: { fontSize: "1.125rem", lineHeight: "calc(1.75 / 1.125)" },
	xl: { fontSize: "1.25rem", lineHeight: "calc(1.75 / 1.25)" },
	"2xl": { fontSize: "1.5rem", lineHeight: "calc(2 / 1.5)" },
	"3xl": { fontSize: "1.875rem", lineHeight: "calc(2.25 / 1.875)" },
	"4xl": { fontSize: "2.25rem", lineHeight: "calc(2.5 / 2.25)" },
	"5xl": { fontSize: "3rem", lineHeight: "1" },
	"6xl": { fontSize: "3.75rem", lineHeight: "1" },
	"7xl": { fontSize: "4.5rem", lineHeight: "1" },
	"8xl": { fontSize: "6rem", lineHeight: "1" },
};

function addDefaultTextStyles(textStyles: Map<string, Record<string, unknown>>): void {
	for (const [name, style] of Object.entries(DEFAULT_PANDA_TEXT_STYLES)) {
		if (!textStyles.has(name)) textStyles.set(name, style);
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
	patterns?: { extend?: Record<string, unknown> } & Record<string, unknown>;
	default?: PandaConfigShape;
}

async function importModule(path: string): Promise<AnyModule> {
	return (await import(pathToFileURL(path).href)) as AnyModule;
}

/** Load semanticTokens/tokens/textStyles from a host panda.config.ts. */
export async function loadPandaTheme(
	configPath: string,
	loader: ProjectModuleLoader = NODE_PROJECT_MODULE_LOADER,
): Promise<PandaTheme> {
	try {
		const official = await loadPandaThemeByOfficialPackage(configPath, loader);
		if (official !== undefined) return official;
	} catch (error) {
		const fallback = await loadPandaThemeByImport(configPath).catch(() =>
			loadPandaThemeFromDisk(configPath),
		);
		return {
			...fallback,
			officialConfigError: error instanceof Error ? error.message : String(error),
		};
	}
	try {
		return await loadPandaThemeByImport(configPath);
	} catch {
		return loadPandaThemeFromDisk(configPath);
	}
}

async function loadPandaThemeByOfficialPackage(
	configPath: string,
	loader: ProjectModuleLoader,
): Promise<PandaTheme | undefined> {
	const packageModule = await loader.importPackage<{
		loadConfig?: (options: { cwd: string; file: string }) => Promise<{ config: PandaConfigShape }>;
	}>("@pandacss/config", dirname(configPath));
	if (packageModule?.loadConfig === undefined) return undefined;
	try {
		const result = await packageModule.loadConfig({ cwd: dirname(configPath), file: configPath });
		// The official loader returns Panda's effective config, including preset and
		// plugin decisions. Never inject built-in values on top of that result:
		// an explicit `presets: []` or feature-removing plugin must remain authoritative.
		return pandaThemeFromConfig(result.config, false);
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
	// Panda's theme; otherwise every generated migration silently gets an
	// empty preset.
	const unwrapped = config?.default ?? config;
	return pandaThemeFromConfig(unwrapped, unwrapped?.presets === undefined);
}

function pandaThemeFromConfig(
	unwrapped: PandaConfigShape | undefined,
	includeBuiltInDefaults = false,
): PandaTheme {
	const theme = unwrapped?.theme ?? {};
	const extend = theme.extend ?? theme;
	const tokens: Record<string, Record<string, unknown>> = {};
	collectTokenValues(extend.tokens, tokens);
	collectTokenValues(extend.semanticTokens, tokens);
	resolveTokenReferences(tokens);
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
	const textStyles = new Map<string, Record<string, unknown>>();
	const tsSection = extend["textStyles"];
	if (isPlainObject(tsSection)) collectTextStyles(tsSection, [], textStyles);
	if (includeBuiltInDefaults) addDefaultTextStyles(textStyles);
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
		textStyles,
		customPatterns,
		plugins: Array.isArray(unwrapped?.plugins) ? unwrapped.plugins : undefined,
		tokenCatalog: TokenCatalog.fromNested(tokens)?.contract,
	};
}

/**
 * Offline loader: reads the config + sibling theme files and extracts the
 * sections from source text (no module evaluation, no deps required).
 */
function loadPandaThemeFromDisk(configPath: string): PandaTheme {
	const dir = dirname(configPath);
	const configSource = sourceWorkspace.read([configPath])[0]?.source;
	if (configSource === undefined) return emptyPandaTheme;
	const extra: Array<string> = [];
	// follow local `import { x } from './y'` references used by the sections
	for (const m of configSource.matchAll(/import\s+\{([^}]*)\}\s+from\s+["']\.\/([^"']+)["']/g)) {
		const names = m[1]!
			.split(",")
			.map((n) => n.trim().split(/\s+as\s+/)[0]!)
			.filter(Boolean);
		void names;
		const candidate = join(dir, `${m[2]}.ts`);
		const source = sourceWorkspace.read([candidate])[0]?.source;
		if (source !== undefined) extra.push(source);
	}
	return loadPandaThemeFromSource(configSource, extra);
}

/** Empty theme — every token candidate falls back to verbatim/CSS-var. */
export const emptyPandaTheme: PandaTheme = {
	tokens: {},
	conditions: {},
	tokenVars: new Map(),
	textStyles: new Map(),
	customPatterns: new Map(),
	plugins: [],
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
function loadPandaThemeFromSource(configSource: string, extraSources: Array<string>): PandaTheme {
	const tokenVars = new Map<string, string>();
	const tokens: Record<string, Record<string, unknown>> = {};
	const textStyles = new Map<string, Record<string, unknown>>();
	const chunks: Array<string> = [configSource, ...extraSources];
	for (const chunk of chunks) {
		for (const m of chunk.matchAll(
			/(?:semanticTokens|tokens|textStyles)\s*[:=]\s*(?:defineSemanticTokens|defineTokens|defineTextStyles)?\s*\(\s*\{/g,
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
	resolveTokenReferences(tokens);
	addDefaultTextStyles(textStyles);
	return {
		tokens,
		conditions: {},
		tokenVars,
		textStyles,
		customPatterns: new Map(),
		plugins: [],
		tokenCatalog: TokenCatalog.fromNested(tokens)?.contract,
	};
}
