/**
 * Generated-metadata loader for the codemod.
 *
 * Everything the codemod knows about the design system is READ from the
 * codegen outputs (never hand-maintained here):
 *
 * - `types.d.ts` — the tw() object keys (interface entries) and each named
 *   value union's literal members;
 * - `tw.ts` — variant names + join separators, and the conflict map whose
 *   per-value CSS property lists are the ground truth for disambiguating
 *   overloaded utilities (`text-blue-500` -> ["color"] -> `textColor`,
 *   `text-lg` -> ["font-size","line-height"] -> `textSize`);
 * - `bridge.ts` — an optional (property, resolved value) -> utility map,
 *   inverted for `css()` mode so emitted declarations carry exact resolved
 *   values. Pandwind does not import this artifact automatically; it is a
 *   runtime dependency only when an app explicitly selects its `twAdapter`.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
// Single source of truth for key -> emitted-utility mapping (textColor -> "text").
import { UTILITY_SUBKEYS } from "pandwind/tw/compile";
import type { PandwindInteropArtifact } from "./tw/index.ts";
import type { AnyTokens } from "pandwind/types/typings";

interface VariantMeta {
	join: ":" | "-" | "";
}

interface KeyInfo {
	/** tw() object key, e.g. `textColor`. */
	key: string;
	/** The utility prefix it emits, e.g. `text`. */
	base: string;
	/** Named value union referenced by the key, if any. */
	valueType: string | undefined;
}

export interface PandwindMeta {
	/** Interface-order list of tw keys with their dashed bases. */
	keys: KeyInfo[];
	/** dashed base -> keys emitting it. */
	keysByBase: Map<string, KeyInfo[]>;
	/** Named union -> quoted literal members. */
	valueLiterals: Map<string, Set<string>>;
	variants: Map<string, VariantMeta>;
	/** conflicts: utility prefix -> (value | "*") -> CSS property list. */
	conflicts: Map<string, Record<string, string[]>>;
	/** Inverted bridge: utility class -> { property, resolvedValue }. */
	bridgeInverse: Map<string, { property: string; value: string }>;
	/** Project-owned token graph used by design and token-reference adapters. */
	tokens: AnyTokens | undefined;
	/** Versioned generated artifact used when available; useful for diagnostics. */
	interop: PandwindInteropArtifact | undefined;
}

/** Empty target metadata for project migrations that do not consume a bridge. */
export function createEmptyPandwindMeta(): PandwindMeta {
	return {
		keys: [],
		keysByBase: new Map(),
		valueLiterals: new Map(),
		variants: new Map(),
		conflicts: new Map(),
		bridgeInverse: new Map(),
		tokens: undefined,
		interop: undefined,
	};
}

const dashCase = (key: string): string => key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/** The utility prefix a tw() key emits (sub-keys resolve onto their base). */
const baseFor = (key: string): string => UTILITY_SUBKEYS[key] ?? dashCase(key);

/** Extract the block of a top-level declaration by name (brace-matched). */
function extractBlock(source: string, header: RegExp): string | undefined {
	const match = header.exec(source);
	if (match === null) return undefined;
	const start = source.indexOf("{", match.index);
	if (start === -1) return undefined;
	let depth = 0;
	for (let i = start; i < source.length; i++) {
		if (source[i] === "{") depth++;
		else if (source[i] === "}") {
			depth--;
			if (depth === 0) return source.slice(start, i + 1);
		}
	}
	return undefined;
}

/** Parse the WindUtilities interface into ordered key entries. */
function parseInterfaceKeys(
	typesDts: string,
): Array<{ key: string; valueType: string | undefined }> {
	const body = extractBlock(typesDts, /interface WindUtilities\b/);
	if (body === undefined) throw new Error("codemod: no `interface WindUtilities` in types.d.ts");
	const entries: Array<{ key: string; valueType: string | undefined }> = [];
	// Every entry is `"key"?: Alias | true | Array<Alias | true>;` — `true`
	// tolerates the runtime's universal bare-boolean-flag support (see
	// tw/compile.ts) regardless of whether this key's own completion probe
	// surfaced a distinct bare candidate.
	const entryRegex =
		/"([^"]+)"\?:\s*([A-Za-z_$][\w$]*)\s*\|\s*true\s*(?:\|\s*Array<([A-Za-z_$][\w$]*)\s*\|\s*true>)?\s*;/g;
	for (const match of body.matchAll(entryRegex)) {
		entries.push({ key: match[1]!, valueType: match[2] });
	}
	return entries;
}

/** Collect quoted literal members of every `type XValue = ...` union. */
function parseValueLiterals(typesDts: string): Map<string, Set<string>> {
	const out = new Map<string, Set<string>>();
	const aliasRegex = /type ([A-Za-z_$][\w$]*) = ([^;\n]+);/g;
	const literalRegex = /"([^"]+)"/g;
	for (const match of typesDts.matchAll(aliasRegex)) {
		const literals = new Set<string>();
		for (const lit of match[2]!.matchAll(literalRegex)) literals.add(lit[1]!);
		out.set(match[1]!, literals);
	}
	return out;
}

function parseVariants(twTs: string): Map<string, VariantMeta> {
	const body = extractBlock(twTs, /\bvariants:\s*\{/);
	const variants = new Map<string, VariantMeta>();
	if (body === undefined) return variants;
	const entryRegex = /"?([\w$]+)"?:\s*\{\s*join:\s*"(:|-|)"\s*\}/g;
	for (const match of body.matchAll(entryRegex)) {
		variants.set(match[1]!, { join: (match[2] ?? ":") as VariantMeta["join"] });
	}
	return variants;
}

function parseConflicts(twTs: string): Map<string, Record<string, string[]>> {
	const body = extractBlock(twTs, /\bconflicts:\s*\{/);
	const conflicts = new Map<string, Record<string, string[]>>();
	if (body === undefined) return conflicts;
	// The inner objects are JSON-shaped (quoted keys, array values).
	const entryRegex = /"([^"]+)":\s*(\{[^{}]*\})/g;
	for (const match of body.matchAll(entryRegex)) {
		try {
			conflicts.set(match[1]!, JSON.parse(match[2]!) as Record<string, string[]>);
		} catch {
			// Malformed slice — skip this entry rather than guessing.
		}
	}
	return conflicts;
}

function parseBridge(bridgeTs: string): Map<string, { property: string; value: string }> {
	const inverse = new Map<string, { property: string; value: string }>();
	const propRegex = /(?:"([^"]+)"|([A-Za-z_$][\w$-]*))\s*:\s*\{([^{}]*)\}/g;
	const utilRegex = /(?:"([^"]+)"|([A-Za-z_$][\w$-]*))\s*:\s*"([^"]+)"/g;
	for (const propMatch of bridgeTs.matchAll(propRegex)) {
		const property = propMatch[1] ?? propMatch[2];
		const values = propMatch[3];
		if (property === undefined || values === undefined) continue;
		for (const utilMatch of values.matchAll(utilRegex)) {
			const utilityClass = utilMatch[3];
			if (utilityClass === undefined) continue;
			if (!inverse.has(utilityClass)) {
				inverse.set(utilityClass, { property, value: utilMatch[1] ?? utilMatch[2] ?? "" });
			}
		}
	}
	return inverse;
}

export interface LoadMetaOptions {
	typesDtsPath?: string;
	twTsPath?: string;
	bridgePath?: string;
	/** Defaults beside types.d.ts/tw.ts when omitted. */
	interopPath?: string;
	/** Explicit project tokens for programmatic callers and tests. */
	tokens?: AnyTokens;
}

function readInterop(path: string | undefined): PandwindInteropArtifact | undefined {
	if (path === undefined) return undefined;
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<PandwindInteropArtifact>;
		if (parsed.schema !== "pandwind.interop/1")
			throw new Error(`codemod: unsupported pandwind interop schema in ${path}`);
		return parsed as PandwindInteropArtifact;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
}

function bridgeInverseFromArtifact(
	bridge: PandwindInteropArtifact["bridge"],
): Map<string, { property: string; value: string }> {
	const inverse = new Map<string, { property: string; value: string }>();
	for (const [property, values] of Object.entries(bridge)) {
		for (const [value, utilityClass] of Object.entries(values)) {
			if (!inverse.has(utilityClass)) inverse.set(utilityClass, { property, value });
		}
	}
	return inverse;
}

export function loadMetaFromSources(options: LoadMetaOptions): PandwindMeta {
	const metadataDir = dirname(options.typesDtsPath ?? options.twTsPath ?? process.cwd());
	const interop = readInterop(options.interopPath ?? resolve(metadataDir, "pandwind.interop.json"));
	const typesDts =
		options.typesDtsPath === undefined ? undefined : readFileSync(options.typesDtsPath, "utf8");
	const twTs = options.twTsPath === undefined ? undefined : readFileSync(options.twTsPath, "utf8");
	if (interop === undefined && (typesDts === undefined || twTs === undefined)) {
		throw new Error(
			"codemod: generated metadata requires pandwind.interop.json or both types.d.ts and tw.ts",
		);
	}

	const keysByBase = new Map<string, KeyInfo[]>();
	const keys =
		interop?.utilities.map(({ key, base, valueType }) => ({ key, base, valueType })) ??
		parseInterfaceKeys(typesDts!).map(({ key, valueType }) => ({
			key,
			base: baseFor(key),
			valueType,
		}));
	for (const info of keys) {
		const list = keysByBase.get(info.base) ?? [];
		list.push(info);
		keysByBase.set(info.base, list);
	}

	return {
		keys,
		keysByBase,
		valueLiterals:
			interop === undefined
				? parseValueLiterals(typesDts!)
				: new Map(
						interop.utilities.map((utility) => [
							utility.valueType ?? utility.key,
							new Set(utility.values),
						]),
					),
		variants:
			interop === undefined
				? parseVariants(twTs!)
				: new Map(
						Object.entries(interop.tw.variants).map(([name, value]) => [
							name,
							{ join: value.join ?? ":" },
						]),
					),
		conflicts:
			interop === undefined
				? parseConflicts(twTs!)
				: new Map(Object.entries(interop.tw.conflicts ?? {})),
		bridgeInverse:
			options.bridgePath !== undefined
				? parseBridge(readFileSync(options.bridgePath, "utf8"))
				: interop === undefined
					? new Map()
					: bridgeInverseFromArtifact(interop.bridge),
		tokens: options.tokens,
		interop,
	};
}

type ModuleExports = Record<string, unknown>;

/** Load project tokens from the preset import emitted into bridge.ts. */
// Project module candidates are intentionally tried in order because only one
// can resolve under the project's module loader.
async function loadTokensFromBridge(bridgePath: string): Promise<AnyTokens | undefined> {
	const source = readFileSync(bridgePath, "utf8");
	const binding = /\bpreset\s*:\s*([A-Za-z_$][\w$]*)/.exec(source)?.[1];
	if (binding === undefined) return undefined;
	for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)) {
		const imported = match[1]!
			.split(",")
			.map((part) => part.trim().split(/\s+as\s+/))
			.find((parts) => (parts[1] ?? parts[0]) === binding);
		if (imported === undefined) continue;
		const module = await importProjectModule(bridgePath, match[2]!);
		const preset = module[imported[0]!] as { tokens?: unknown } | undefined;
		if (preset?.tokens !== null && typeof preset?.tokens === "object") {
			return preset.tokens as AnyTokens;
		}
	}
	return undefined;
}

async function importProjectModule(fromFile: string, specifier: string): Promise<ModuleExports> {
	if (!specifier.startsWith(".")) return (await import(specifier)) as ModuleExports;
	const base = pathToFileURL(resolve(dirname(fromFile), specifier)).href;
	let lastError: unknown;
	for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`]) {
		try {
			return (await import(candidate)) as ModuleExports;
		} catch (error) {
			lastError = error;
		}
	}
	throw lastError;
}

/** Async project-aware loader used by the CLI. */
export async function loadMetaFromSourcesAsync(options: LoadMetaOptions): Promise<PandwindMeta> {
	const tokens =
		options.tokens ??
		(options.bridgePath === undefined ? undefined : await loadTokensFromBridge(options.bridgePath));
	return loadMetaFromSources({ ...options, tokens });
}
