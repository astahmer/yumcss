/**
 * Panda host-project scanning.
 *
 * Two responsibilities:
 * - usage scan: whole-codebase inventory of recipes / patterns / jsx
 *   components actually used (fn call sites AND JSX elements) plus local
 *   cva/sva/defineRecipe definitions and `panda()` factory components —
 *   drives emission (unused defs are never emitted) and tier assignment
 *   (single-call-site definitions fold, shared ones become modules);
 * - import-alias detection: package.json#imports first, then declared
 *   aliases from next.config.(ts|mjs|js), vite configs (+vite-tsconfig-paths),
 *   shadcn components.json and tsconfig paths — so emitted code is imported
 *   the way the host app already imports things.
 */
import { join } from "node:path";
import { CodemodAdapterId } from "../../identifiers.ts";
import { createSourceWorkspace } from "pandwind/source/workspace";

const enum PandaFactoryComponentKindTag {
	Style = "style",
	Recipe = "recipe",
}

const enum PandaDefinitionKindTag {
	Cva = "cva",
	Sva = "sva",
}

const sourceWorkspace = createSourceWorkspace();

/* ------------------------------------------------------------------ */
/* alias resolution                                                    */
/* ------------------------------------------------------------------ */

export interface AliasInfo {
	/** Alias prefix WITHOUT trailing slash ("@/" or "#app"). Empty = relative. */
	alias: string;
	/** Directory the alias points at, relative to the project root. */
	targetRoot: string;
	/** Human source of the decision (report/logs). */
	source: string;
}

function readJson(path: string): Record<string, unknown> | null {
	const source = sourceWorkspace.read([path])[0]?.source;
	if (source === undefined) return null;
	try {
		return JSON.parse(source) as Record<string, unknown>;
	} catch {
		return null;
	}
}

/** Resolve a wildcard mapping to its output directory. */
function mappingTarget(value: unknown): string {
	if (typeof value === "string") return value;
	if (value !== null && typeof value === "object") {
		for (const nested of Object.values(value as Record<string, unknown>)) {
			const target = mappingTarget(nested);
			if (target !== "") return target;
		}
	}
	return "";
}

function targetRoot(value: string): string {
	return value.replace(/\*.*$/, "").replace(/^\.\//, "").replace(/\/$/, "");
}

/** package.json#imports subpath aliases (`#app/*` style). */
function fromPackageImports(root: string): AliasInfo | null {
	const pkg = readJson(join(root, "package.json"));
	const imports = pkg?.["imports"];
	if (imports !== null && typeof imports === "object" && imports !== undefined) {
		const table = imports as Record<string, unknown>;
		const keys = Object.keys(table).filter((k) => k.startsWith("#"));
		// Prefer a wildcard alias over single-file mappings.
		const wildcard = keys.find((k) => k.endsWith("/*")) ?? keys[0];
		if (wildcard !== undefined) {
			return {
				alias: wildcard.replace(/\/\*$/, ""),
				targetRoot: targetRoot(mappingTarget(table[wildcard])),
				source: "package.json#imports",
			};
		}
	}
	return null;
}

/** Scan a JS/TS config file's text for an alias-looking mapping. */
function fromConfigText(root: string, files: Array<string>, label: string): AliasInfo | null {
	for (const file of files) {
		const path = join(root, file);
		const text = sourceWorkspace.read([path])[0]?.source;
		if (text === undefined) continue;
		const match =
			/['"](@[^'"]*)\/\*['"]\s*:\s*['"]([^'"]+)['"]/.exec(text) ??
			/['"]([\w.-]+)\/\*['"]\s*:\s*['"]([^'"]+)['"]/.exec(text);
		if (match !== null)
			return { alias: match[1]!, targetRoot: targetRoot(match[2]!), source: `${label} (${file})` };
	}
	return null;
}

/** tsconfig paths fallback. */
function fromTsconfig(root: string): AliasInfo | null {
	for (const file of ["tsconfig.json", "tsconfig.app.json"]) {
		const ts = readJson(join(root, file));
		const paths = ts?.["compilerOptions"] as
			| { paths?: Record<string, unknown>; baseUrl?: unknown }
			| undefined;
		const keys = Object.keys(paths?.paths ?? {});
		const wildcard = keys.find((k) => k.endsWith("/*"));
		if (wildcard !== undefined) {
			const mapping = paths?.paths?.[wildcard];
			const target = Array.isArray(mapping)
				? (mapping.find((value): value is string => typeof value === "string") ?? "")
				: "";
			return {
				alias: wildcard.replace(/\/\*$/, ""),
				targetRoot: targetRoot(target),
				source: `${file} paths`,
			};
		}
	}
	return null;
}

/**
 * Detect the host app's import-alias convention (decision order per plan
 * 024: package.json#imports -> next/vite/components.json -> tsconfig).
 */
export function detectAlias(root: string): AliasInfo {
	return (
		fromPackageImports(root) ??
		fromConfigText(root, ["next.config.ts", "next.config.mjs", "next.config.js"], "next.config") ??
		fromConfigText(root, ["vite.config.ts", "vite.config.mts", "vite.config.js"], "vite.config") ??
		fromComponentsJson(root) ??
		fromTsconfig(root) ?? { alias: "", targetRoot: "", source: "no alias found — relative imports" }
	);
}

function fromComponentsJson(root: string): AliasInfo | null {
	const cfg = readJson(join(root, "components.json"));
	const aliases = cfg?.["aliases"] as Record<string, string> | undefined;
	const utils = aliases?.["utils"] ?? aliases?.["ui"];
	const match = typeof utils === "string" ? /^(@[\w./-]+)\//.exec(utils) : null;
	if (match !== null)
		return { alias: match[1]!, targetRoot: "src", source: "components.json aliases" };
	return null;
}

/** Import specifier for `<outDir>/<subpath>` given the detected alias. */
export function aliasSpecifier(aliasInfo: AliasInfo, outDirName: string, subpath: string): string {
	if (aliasInfo.alias === "") return `${outDirName}/${subpath}`;
	return `${aliasInfo.alias}/${outDirName}/${subpath}`;
}

/* ------------------------------------------------------------------ */
/* usage scan                                                          */
/* ------------------------------------------------------------------ */

interface RecipeUsage {
	/** Local binding name at the call site (may differ from export). */
	local: string;
	/** Files using it, with call-site counts. */
	callSites: number;
	asChildSites: number;
}

export interface ProjectUsage {
	/** Imported recipe fns + local cva/sva/defineRecipe defs, by name. */
	recipes: Map<string, RecipeUsage>;
	/** Pattern fn names in use (hstack, grid, custom…). */
	patterns: Set<string>;
	/** styled-system/jsx layout component names used in JSX. */
	jsxComponents: Set<string>;
	/** `<panda.tag>` element tag names seen. */
	factoryTags: Set<string>;
	/** panda(tagOrComp, styleOrRecipe) declarations: name -> arg2 kind. */
	factoryComponents: Array<{
		name: string;
		target: string;
		kind: `${PandaFactoryComponentKindTag}`;
		start: number;
		end: number;
	}>;
	/** cva/sva/defineRecipe variable declarations. */
	definitions: Array<{
		name: string;
		kind: `${PandaDefinitionKindTag}`;
		start: number;
		end: number;
	}>;
}

const RECIPE_IMPORT_RE = /from\s+["'][^"']*styled-system\/recipes["']/g;

function emptyProjectUsage(): ProjectUsage {
	return {
		recipes: new Map(),
		patterns: new Set(),
		jsxComponents: new Set(),
		factoryTags: new Set(),
		factoryComponents: [],
		definitions: [],
	};
}

function touchRecipe(usage: ProjectUsage, local: string): void {
	const existing = usage.recipes.get(local);
	if (existing === undefined) usage.recipes.set(local, { local, callSites: 0, asChildSites: 0 });
}

/**
 * Text-level usage scan over one file's source (already read). Regex-first
 * by design — the inventory only needs NAMES and COUNTS, not positions.
 */
function scanFileUsage(file: string, source: string, usage: ProjectUsage): void {
	void file;

	// Recipes imported from styled-system/recipes.
	if (RECIPE_IMPORT_RE.test(source)) {
		RECIPE_IMPORT_RE.lastIndex = 0;
		for (const imp of source.matchAll(
			/import\s*\{([^}]*)\}\s*from\s+["'][^"']*styled-system\/recipes["']/g,
		)) {
			for (const rawSpec of imp[1]!.split(",")) {
				const spec = rawSpec.trim();
				if (spec === "") continue;
				const asMatch = /^([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(spec);
				if (asMatch !== null) touchRecipe(usage, asMatch[2] ?? asMatch[1]!);
			}
		}
	}

	// Pattern fn imports.
	for (const imp of source.matchAll(
		/import\s*\{([^}]*)\}\s*from\s+["'][^"']*styled-system\/patterns["']/g,
	)) {
		for (const rawSpec of imp[1]!.split(",")) {
			const spec = rawSpec.trim();
			if (spec === "") continue;
			const asMatch = /^([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(spec);
			if (asMatch !== null) usage.patterns.add(asMatch[2] ?? asMatch[1]!);
		}
	}

	// JSX layout components from styled-system/jsx.
	for (const imp of source.matchAll(
		/import\s*\{([^}]*)\}\s*from\s+["'][^"']*styled-system\/jsx["']/g,
	)) {
		for (const rawSpec of imp[1]!.split(",")) {
			const spec = rawSpec.trim();
			const name = spec === CodemodAdapterId.Panda ? "" : (spec.split(/\s+as\s+/)[0] ?? "");
			if (name !== "") usage.jsxComponents.add(name);
		}
	}

	// Call sites: recipe fns + pattern fns.
	for (const [local, info] of usage.recipes) {
		const calls = source.matchAll(new RegExp(`(?<![\\w.])${local}\\s*\\(`, "g"));
		let count = 0;
		for (const _ of calls) count++;
		info.callSites += count;
		void local;
	}
	// Imported pattern names already entered usage.patterns above; no second
	// mutation pass is needed here.

	// JSX element usages (<Stack …>, <panda.div …>).
	for (const el of source.matchAll(/<([A-Z][\w]*)[\s/>]/g)) {
		usage.jsxComponents.add(el[1]!);
	}
	for (const el of source.matchAll(/<panda\.([\w]+)/g)) {
		usage.factoryTags.add(el[1]!);
	}

	// cva/sva/defineRecipe variable declarations.
	for (const def of source.matchAll(
		/(?:const|let|var)\s+([\w$]+)\s*=\s*(?:(?:cva|defineRecipe)|(?:sva|defineSlotRecipe))\s*\(/g,
	)) {
		const kind = /sva|defineSlotRecipe/.test(def[0])
			? PandaDefinitionKindTag.Sva
			: PandaDefinitionKindTag.Cva;
		usage.definitions.push({
			name: def[1]!,
			kind,
			start: def.index ?? 0,
			end: (def.index ?? 0) + def[0].length,
		});
	}

	// panda(tagOrComponent, styleOrRecipe) factory declarations.
	for (const factory of source.matchAll(
		/(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*=\s*panda\s*\(\s*(['"][\w]+|[\w$]+)\s*,/g,
	)) {
		const target = factory[2]!.replace(/^['"]|['"]$/g, "");
		const afterComma = (factory.index ?? 0) + factory[0].length;
		const rest = source.slice(afterComma);
		// Second arg: identifier bound to a known recipe def/import -> recipe
		// component; anything else (object literal) -> styled component.
		const ident = /^\s*([\w$]+)/.exec(rest)?.[1] ?? "";
		const isRecipeArg =
			(ident !== "" && usage.recipes.has(ident)) || usage.definitions.some((d) => d.name === ident);
		usage.factoryComponents.push({
			name: factory[1]!,
			target,
			kind: isRecipeArg ? PandaFactoryComponentKindTag.Recipe : PandaFactoryComponentKindTag.Style,
			start: factory.index ?? 0,
			end: (factory.index ?? 0) + factory[0].length,
		});
	}
}

/** Scan every file into one aggregate ProjectUsage. */
export function scanProjectUsage(
	files: ReadonlyArray<{ path: string; source: string }>,
): ProjectUsage {
	const usage = emptyProjectUsage();
	for (const { path: p, source } of files) scanFileUsage(p, source, usage);
	return usage;
}
