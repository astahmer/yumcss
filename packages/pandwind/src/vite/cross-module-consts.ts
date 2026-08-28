/**
 * Cross-module constant propagation for the vite cx/tw passes.
 *
 * Same-module constants are handled inside `collectModuleConstants`
 * (cx-inline.ts); this module extends propagation ACROSS modules:
 *
 * ```ts
 * // styles/constants.ts
 * export const P6 = "p-6";
 * // app.tsx
 * import { P6 } from "./styles/constants";
 * export const cls = cx(P6, "text-sm"); // folds to "p-6 text-sm" at build time
 * ```
 *
 * Design contract (see plans/007 A++):
 *
 * - The plugin holds a per-build resolver with a cache keyed by absolute path
 *   + mtime, invalidated per-file on HMR.
 * - Resolution follows re-exports exactly ONE barrel level deep
 *   (`app.tsx -> barrel.ts -> constants.ts`); deeper chains stay dynamic.
 * - Only string values propagate: plain string literals and expression-less
 *   template literals on top-level `export const` bindings.
 * - A consumer binding propagates only when it is provably not shadowed and
 *   never written in the consumer (import specifiers themselves are fine —
 *   that IS the binding).
 * - Circular imports, missing files, non-literal exports and dynamic sources
 *   resolve to nothing: the call is left untouched, nothing ever throws.
 */
import { dirname } from "node:path";
import { type Expression } from "oxc-parser";
import { SOURCE_SCANNER_SERVICE } from "../source-scanner.ts";
import { bindingIsShadowedOrWritten } from "./ast-walk.ts";
import type { ConstantScope, KnownConstant } from "./cx-inline.ts";
import type { OxcNode } from "../tw/literal.ts";
import {
	NodeModulePathResolver,
	NodeModuleSourceReader,
	type ModulePathResolver,
	type ModuleSourceReader,
} from "./module-ports.ts";

/** Analysis of one module's exported constants and re-export surface. */
export interface ModuleExportAnalysis {
	/** Exported name -> string value (string literals / bare templates). */
	strings: Map<string, string>;
	/** Exported name -> re-export origin (`export { A } from "./b"`). */
	reexports: Map<string, { source: string; orig: string }>;
	/** `export * from "./b"` sources, resolved last (name carried over). */
	stars: string[];
}

/** One named import binding in the consumer module. */
export interface ImportBinding {
	localName: string;
	source: string;
	importedName: string;
}

function parseProgram(code: string, id: string): OxcNode {
	const result = SOURCE_SCANNER_SERVICE.parse({ file: id, source: code }) as unknown as { program: OxcNode };
	return result.program;
}

/**
 * Extract exported string constants and the re-export surface from a parsed
 * module. Only top-level `export const NAME = <string literal | template
 * without expressions>` counts as a propagatable value.
 */
export function analyzeModuleExports(program: OxcNode): ModuleExportAnalysis {
	const strings = new Map<string, string>();
	const reexports = new Map<string, { source: string; orig: string }>();
	const stars: string[] = [];

	for (const statement of (program as { body?: OxcNode[] }).body ?? []) {
		const type = (statement as { type?: string }).type;
		if (type === "ExportNamedDeclaration") {
			const source = (statement as { source?: { value?: string } }).source?.value;
			const declarations = (statement as { declaration?: OxcNode | null }).declaration;
			if (declarations !== null && declarations !== undefined) {
				if ((declarations as { kind?: string }).kind !== "const") continue;
				for (const declarator of (declarations as { declarations?: OxcNode[] }).declarations ??
					[]) {
					const id = (declarator as { id?: OxcNode }).id;
					const name = (id as { name?: string } | undefined)?.name;
					const init = (declarator as { init?: Expression | null }).init;
					if (typeof name !== "string" || init === null || init === undefined) continue;
					const value = staticString(init);
					if (value !== undefined && !strings.has(name)) strings.set(name, value);
				}
				continue;
			}
			if (typeof source === "string") {
				for (const specifier of (statement as { specifiers?: Array<Record<string, unknown>> })
					.specifiers ?? []) {
					const local = ((specifier.local ?? specifier.imported) as { name?: string } | undefined)
						?.name;
					const exported = (
						(specifier.exported ?? specifier.local) as { name?: string } | undefined
					)?.name;
					if (typeof local === "string" && typeof exported === "string") {
						if (!reexports.has(exported)) reexports.set(exported, { source, orig: local });
					}
				}
				continue;
			}
		} else if (type === "ExportAllDeclaration") {
			const source = (statement as { source?: { value?: string } }).source?.value;
			if (typeof source === "string" && !stars.includes(source)) stars.push(source);
		}
	}

	return { strings, reexports, stars };
}

/** Static string value of an initializer: string literal or bare template. */
function staticString(node: Expression): string | undefined {
	if ((node as { type?: string }).type === "Literal") {
		const value = (node as { value?: unknown }).value;
		return typeof value === "string" ? value : undefined;
	}
	if ((node as { type?: string }).type === "TemplateLiteral") {
		const expressions = (node as { expressions?: unknown[] }).expressions ?? [];
		if (expressions.length > 0) return undefined;
		const quasis = (node as { quasis?: Array<{ value: { cooked?: string; raw: string } }> }).quasis;
		return quasis?.[0]?.value.cooked ?? quasis?.[0]?.value.raw;
	}
	return undefined;
}

/** Collect every named import binding in the consumer module. */
export function collectImportBindings(program: OxcNode): ImportBinding[] {
	const bindings: ImportBinding[] = [];
	for (const statement of (program as { body?: OxcNode[] }).body ?? []) {
		if ((statement as { type?: string }).type !== "ImportDeclaration") continue;
		const source = (statement as { source?: { value?: string } }).source?.value;
		if (typeof source !== "string") continue;
		for (const specifier of (statement as { specifiers?: Array<Record<string, unknown>> })
			.specifiers ?? []) {
			if (specifier.type === "ImportDefaultSpecifier") continue;
			const local = (specifier.local as { name?: string } | undefined)?.name;
			const imported = (specifier.imported as { name?: string } | undefined)?.name ?? local;
			if (typeof local === "string" && typeof imported === "string") {
				bindings.push({ localName: local, source, importedName: imported });
			}
		}
	}
	return bindings;
}

/**
 * True when `name` is shadowed or written anywhere in the consumer besides
 * its own import specifier — such a binding must not propagate (the runtime
 * value could differ from the exported constant).
 *
 * Implementation lives in `./ast-walk.ts` (pure, browser-safe); re-exported
 * here for backwards compatibility.
 */
export { bindingIsShadowedOrWritten };

/** Resolves consumer import bindings to propagated string constants. */
export interface CrossModuleResolver {
	/**
	 * Build a `ConstantScope` for every import binding of `program` that
	 * resolves to an exported string constant. Entries use `declStart: 0`
	 * (imports are live for the whole module — no TDZ guard applies).
	 */
	importedScope(id: string, program: OxcNode): ConstantScope;
	/** Drop the cached analysis of one file (HMR invalidation). */
	invalidate(absPath: string): void;
}

interface CacheEntry {
	mtimeMs: number;
	analysis: ModuleExportAnalysis | null;
}

export interface CrossModuleResolverOptions {
	readonly sourceReader?: ModuleSourceReader;
	readonly pathResolver?: ModulePathResolver;
}

export function createCrossModuleConstResolver(
	options: CrossModuleResolverOptions = {},
): CrossModuleResolver {
	const cache = new Map<string, CacheEntry>();
	const sourceReader = options.sourceReader ?? new NodeModuleSourceReader();
	const pathResolver = options.pathResolver ?? new NodeModulePathResolver();

	const analyze = (absPath: string): ModuleExportAnalysis | null => {
		try {
			const mtimeMs = sourceReader.mtime(absPath);
			const cached = cache.get(absPath);
			if (cached !== undefined && cached.mtimeMs === mtimeMs) return cached.analysis;
			const code = sourceReader.read(absPath);
			const analysis = analyzeModuleExports(parseProgram(code, absPath));
			cache.set(absPath, { mtimeMs, analysis });
			return analysis;
		} catch {
			cache.set(absPath, { mtimeMs: -1, analysis: null });
			return null;
		}
	};

	const resolveValue = (
		source: string,
		importerDir: string,
		importedName: string,
		depth: number,
	): string | undefined => {
		if (!source.startsWith(".") && !source.startsWith("/")) return undefined;
		const absPath = pathResolver.resolve(source, importerDir);
		if (absPath === undefined) return undefined;
		const mod = analyze(absPath);
		if (mod === null) return undefined;

		const direct = mod.strings.get(importedName);
		if (direct !== undefined) return direct;

		// One barrel level deep: a re-export target of the direct import is
		// followed once; ITS own re-exports are not (depth guard).
		if (depth >= 1) return undefined;
		const reexport = mod.reexports.get(importedName);
		if (reexport !== undefined && !mod.strings.has(reexport.orig)) {
			return resolveValue(reexport.source, dirname(absPath), reexport.orig, depth + 1);
		}
		for (const star of mod.stars) {
			const value = resolveValue(star, dirname(absPath), importedName, depth + 1);
			if (value !== undefined) return value;
		}
		return undefined;
	};

	return {
		importedScope(id: string, program: OxcNode): ConstantScope {
			const scope: ConstantScope = new Map();
			const importerDir = dirname(id);
			for (const binding of collectImportBindings(program)) {
				const { localName, source, importedName } = binding;
				if (bindingIsShadowedOrWritten(program, localName)) continue;
				const value = resolveValue(source, importerDir, importedName, 0);
				if (value !== undefined) {
					const known: KnownConstant = { value, declStart: 0 };
					scope.set(localName, known);
				}
			}
			return scope;
		},
		invalidate(absPath: string): void {
			cache.delete(absPath);
		},
	};
}
