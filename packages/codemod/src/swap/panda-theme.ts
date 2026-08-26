/**
 * Host-app panda theme ingestion (plan 024 step 2).
 *
 * Loads a panda.config.ts via dynamic import (same mechanism as the
 * definePreset importer in token-set.ts) and flattens the pieces the
 * panda inbound parser needs:
 *
 * - semanticTokens / tokens -> known token PATHS (`fg.muted`, `neutral.700`)
 *   plus the generated CSS-var name each maps to (`--colors-fg-muted`) for
 *   the transitional var() fallback;
 * - textStyles -> name -> plain declaration object, expanded inline by the
 *   parser (a textStyle is bundled utilities).
 *
 * Nothing here resolves conditional `{ base, _dark }` VALUES — references
 * stay symbolic so dark-mode switching survives migration (pass 1 lifts the
 * tokens themselves into a pandwind preset).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { matchBlock } from "../sources.ts";
import { parseObjectLiteral } from "./parse.ts";
import { literalToPlain } from "./parse-panda.ts";

export interface PandaCustomPattern {
	/** Runtime transform from pattern props to a style object. */
	transform?: (
		props: Record<string, unknown>,
		helpers: Record<string, unknown>,
	) => Record<string, unknown>;
	defaultValues?: Record<string, unknown>;
}

export interface PandaTheme {
	/** Known token reference paths -> generated CSS custom property name. */
	tokenVars: ReadonlyMap<string, string>;
	/** textStyle name -> plain declaration object (the `.value` payload). */
	textStyles: ReadonlyMap<string, Record<string, unknown>>;
	/** Custom pattern definitions loaded from panda.config.ts. */
	customPatterns: ReadonlyMap<string, PandaCustomPattern>;
}

interface ValueBox {
	value?: unknown;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v);

/** Recurse a panda token tree until `{ value: ... }` leaves; collect paths. */
const dashSegment = (segment: string): string =>
	segment.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

function collectTokenPaths(
	node: Record<string, unknown>,
	prefix: string[],
	group: string | null,
	out: Map<string, string>,
): void {
	for (const [key, child] of Object.entries(node)) {
		if (!isPlainObject(child)) continue;
		const box = child as ValueBox;
		if ("value" in box) {
			const segments = prefix.concat(key === "DEFAULT" ? [] : [key]);
			if (segments.length === 0) continue;
			const path = segments.join(".");
			const dashed = segments.map(dashSegment).join("-");
			const varGroup = group === null ? "" : `${dashSegment(group)}-`;
			out.set(path, `--${varGroup}${dashed}`);
			continue;
		}
		// First nesting level names the GROUP; paths are relative to it.
		const nextPrefix = key === "DEFAULT" ? prefix : group === null ? [] : prefix.concat(key);
		collectTokenPaths(child, nextPrefix, group ?? key, out);
	}
}

/** Recurse textStyles until `{ value: <declarations> }` leaves. */
function collectTextStyles(
	node: Record<string, unknown>,
	prefix: string[],
	out: Map<string, Record<string, unknown>>,
): void {
	for (const [key, child] of Object.entries(node)) {
		if (!isPlainObject(child)) continue;
		const box = child as ValueBox;
		if ("value" in box && isPlainObject(box.value)) {
			out.set(prefix.concat(key).join("."), box.value);
			continue;
		}
		collectTextStyles(child, prefix.concat(key), out);
	}
}

type AnyModule = Record<string, unknown>;

async function importModule(path: string): Promise<AnyModule> {
	return (await import(pathToFileURL(path).href)) as AnyModule;
}

/** Load semanticTokens/tokens/textStyles from a host panda.config.ts. */
export async function loadPandaTheme(configPath: string): Promise<PandaTheme> {
	try {
		return await loadPandaThemeByImport(configPath);
	} catch {
		return loadPandaThemeFromDisk(configPath);
	}
}

async function loadPandaThemeByImport(configPath: string): Promise<PandaTheme> {
	const mod = await importModule(configPath);
	const config = (mod.default ?? Object.values(mod)[0]) as
		| {
				theme?: { extend?: Record<string, unknown>; tokens?: Record<string, unknown> };
				patterns?: { extend?: Record<string, unknown> };
		  }
		| undefined;
	const extend = config?.theme?.extend ?? {};
	const tokenVars = new Map<string, string>();
	for (const key of ["semanticTokens", "tokens"] as const) {
		const section = extend[key];
		if (isPlainObject(section)) collectTokenPaths(section, [], null, tokenVars);
	}
	const textStyles = new Map<string, Record<string, unknown>>();
	const tsSection = extend["textStyles"];
	if (isPlainObject(tsSection)) collectTextStyles(tsSection, [], textStyles);
	const customPatterns = new Map<string, PandaCustomPattern>();
	const patternSection = config?.patterns?.extend;
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
	return { tokenVars, textStyles, customPatterns };
}

/**
 * Offline loader: reads the config + sibling theme files and extracts the
 * sections from source text (no module evaluation, no deps required).
 */
function loadPandaThemeFromDisk(configPath: string): PandaTheme {
	const dir = dirname(configPath);
	const configSource = readFileSync(configPath, "utf8");
	const extra: Array<string> = [];
	// follow local `import { x } from './y'` references used by the sections
	for (const m of configSource.matchAll(/import\s+\{([^}]*)\}\s+from\s+["']\.\/([^"']+)["']/g)) {
		const names = m[1]!
			.split(",")
			.map((n) => n.trim().split(/\s+as\s+/)[0]!)
			.filter(Boolean);
		void names;
		const candidate = join(dir, `${m[2]}.ts`);
		try {
			extra.push(readFileSync(candidate, "utf8"));
		} catch {
			// optional file — skip
		}
	}
	return loadPandaThemeFromSource(configSource, extra);
}

/** Empty theme — every token candidate falls back to verbatim/CSS-var. */
export const emptyPandaTheme: PandaTheme = {
	tokenVars: new Map(),
	textStyles: new Map(),
	customPatterns: new Map(),
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
export function loadPandaThemeFromSource(
	configSource: string,
	extraSources: Array<string>,
): PandaTheme {
	const tokenVars = new Map<string, string>();
	const textStyles = new Map<string, Record<string, unknown>>();
	const chunks: Array<string> = [configSource, ...extraSources];
	for (const chunk of chunks) {
		for (const m of chunk.matchAll(
			/(?:semanticTokens|tokens|textStyles)\s*[:=]\s*(?:defineSemanticTokens|defineTokens|defineTextStyles)?\s*\(\s*\{/g,
		)) {
			const section = /^(\w+)/.exec(m[0].trim())?.[1] ?? "";
			const open = (m.index ?? 0) + m[0].length - 1;
			const block = matchBlock(chunk, open);
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
					collectTokenPaths({ [group]: subtree }, [], null, tokenVars);
				}
			}
		}
	}
	return { tokenVars, textStyles, customPatterns: new Map() };
}
