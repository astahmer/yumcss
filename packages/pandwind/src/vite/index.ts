/**
 * pandwind vite plugin — statically inlines `tw()` calls at build time.
 *
 * ```ts
 * // vite.config.ts
 * import { pandwindVite } from "pandwind/vite";
 * import tailwindcss from "@tailwindcss/vite";
 *
 * export default defineConfig({
 *   plugins: [pandwindVite(), tailwindcss()],
 * });
 * ```
 *
 * `enforce: "pre"` runs the transform before Tailwind's own scanner: every
 * `tw({ ... })` call with a literal object is replaced by its compiled class
 * string, so the classes are discovered naturally and nothing is paid at
 * runtime. Calls with dynamic arguments keep working through the runtime and
 * can still be covered by the `tw:scan` safelist.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { parseSync } from "oxc-parser";
import { walk } from "../tw/literal.ts";
import { findCxImports, inlineCxCalls } from "./cx-inline.ts";
import { createCrossModuleConstResolver } from "./cross-module-consts.ts";
import { type OxcNode } from "../tw/literal.ts";
import { findCssImports } from "./css-extract.ts";
import { createPandwindEngineContext, type PandwindEngineContext } from "./engine-context.ts";
import type { AnyClassNameStrategy } from "../css/class-name-strategy.ts";
import type { CssPreset } from "./css-extract.ts";
import { extractTwConfig, inlineTwCalls, type TwConfig } from "./inline.ts";

export interface PandwindViteOptions {
	/**
	 * Import sources that point at the generated tw module. Defaults to any
	 * source whose basename is `tw` (`./tw`, `../tw.ts`, ...).
	 */
	twSources?: Array<string | RegExp>;
	/**
	 * Import sources that point at the app's cx module (created via
	 * `createCx` with the same generated metadata). When a file imports both
	 * tw and cx, statically-evaluable `cx(...)` calls are folded to their
	 * exact runtime output at build time — byte-identical by construction,
	 * proven differentially in tests/vite-cx-inline.test.ts. Defaults to any
	 * source whose basename is `cx`. Only calls whose every argument is
	 * static fold; dynamic ones keep working through the runtime.
	 */
	cxSources?: Array<string | RegExp>;
	/** Files to skip, as regexes matched against the module id. */
	exclude?: RegExp[];
	/**
	 * Enable compile-time folding of literal `css()` atoms inside `cx()`
	 * calls. Requires the app's preset (and optionally the same class-name
	 * strategy the runtime binds). Folded atoms join the merge through the
	 * shared engine context's atom registry and are guaranteed to match the
	 * rules `pandwindCssVite` generates for the same literals — pass the
	 * SAME `engine` to both plugins to make that sharing explicit.
	 *
	 * Calls that cannot fold safely ($input dynamics, refused strategies,
	 * non-literal arguments) keep working through the runtime.
	 */
	css?: {
		preset: CssPreset;
		className?: AnyClassNameStrategy;
		/** Shared engine context — see createPandwindEngineContext. */
		engine?: PandwindEngineContext;
		/**
		 * Import sources pointing at css/design modules. Defaults to any
		 * source whose basename is `css` or `design`.
		 */
		cssSources?: Array<string | RegExp>;
	};
}

interface Resolver {
	resolve(
		source: string,
		importer: string,
		options?: { skipSelf?: boolean },
	): Promise<{ id: string } | null> | { id: string } | null | undefined;
}

interface ImportInfo {
	localNames: Set<string>;
	sources: string[];
}

/** Collect local bindings imported from tw modules in `code`. */
function findTwImports(
	code: string,
	id: string,
	isTwSource: (source: string) => boolean,
): ImportInfo {
	const result = parseSync(id, code, {
		sourceType: "module",
		lang: id.endsWith(".tsx") ? "tsx" : "ts",
	});
	const info: ImportInfo = { localNames: new Set(), sources: [] };

	walk(result.program, (node) => {
		if (node.type !== "ImportDeclaration") return;
		const source = (node as { source?: { value?: string } }).source?.value;
		if (typeof source !== "string" || !isTwSource(source)) return;
		info.sources.push(source);
		for (const specifier of (node as { specifiers?: OxcSpecifier[] }).specifiers ?? []) {
			if (specifier.type !== "ImportSpecifier") continue;
			const imported = (specifier as { imported?: { name?: string } }).imported?.name;
			const local = (specifier as { local?: { name?: string } }).local?.name;
			if (imported === "tw" && typeof local === "string") {
				info.localNames.add(local);
			}
		}
	});
	return info;
}

interface OxcSpecifier {
	type: string;
}

/**
 * Create the vite plugin. The transform is idempotent: already-inlined string
 * literals are never tw calls, so repeated runs are safe.
 */
/** Source-matcher shared by the tw and cx import detection. */
/** Parse a module and return its program node (for const-binding scans). */
function parseProgramForConsts(code: string, id: string): OxcNode {
	const parsed = parseSync(id, code, {
		sourceType: "module",
		lang: id.endsWith(".tsx") ? "tsx" : "ts",
	}) as unknown as { program: OxcNode };
	return parsed.program;
}

function matchesSource(
	source: string,
	matchers?: Array<string | RegExp>,
	fallbackBasename?: string,
): boolean {
	if (matchers !== undefined) {
		return matchers.some((matcher) =>
			typeof matcher === "string"
				? source === matcher || source.endsWith(`/${matcher}`)
				: matcher.test(source),
		);
	}
	return basename(source).replace(/\.[jt]sx?$/, "") === fallbackBasename;
}

export function pandwindVite(options: PandwindViteOptions = {}) {
	const configCache = new Map<string, TwConfig>();

	const cssFold = options.css
		? {
				engine:
					options.css.engine ??
					createPandwindEngineContext({
						preset: options.css.preset,
						className: options.css.className,
					}),
				cssSources: options.css.cssSources ?? (["css", "design"] as Array<string | RegExp>),
			}
		: undefined;

	const isTwSource = (source: string): boolean => matchesSource(source, options.twSources, "tw");
	const isCxSource = (source: string): boolean =>
		matchesSource(source, options.cxSources ?? options.twSources, "cx");

	const loadConfig = async (
		resolver: Resolver,
		importer: string,
		source: string,
	): Promise<TwConfig | undefined> => {
		const resolved = await resolver.resolve(source, importer, {
			skipSelf: true,
		});
		if (resolved === null || resolved === undefined) return undefined;
		const cached = configCache.get(resolved.id);
		if (cached !== undefined) return cached;
		const sourceCode = readFileSync(resolved.id, "utf8");
		const config = extractTwConfig(sourceCode);
		if (config !== undefined) configCache.set(resolved.id, config);
		return config;
	};

	const crossModuleResolver = createCrossModuleConstResolver();

	return {
		name: "pandwind:inline-tw",
		enforce: "pre",
		async transform(this: Resolver, code: string, id: string) {
			if (id.includes("node_modules")) return null;
			if (options.exclude?.some((pattern) => pattern.test(id))) return null;
			if (!/\b(tw|cx)\b/.test(code)) return null;

			const imports = findTwImports(code, id, isTwSource);
			if (imports.localNames.size === 0 && imports.sources.length === 0) {
				// A cx import without a tw import can't be folded safely: the
				// generated conflict/compose metadata is what makes build-time
				// output provably identical to the runtime merge.
				return null;
			}

			let config: TwConfig | undefined;
			// Sequential short-circuit: stop at the first source that resolves
			// to a generated tw module. Promise.all would load them needlessly.
			for (const source of imports.sources) {
				// oxlint-disable-next-line no-await-in-loop
				config = await loadConfig(this, id, source);
				if (config !== undefined) break;
			}
			if (config === undefined) return null;

			let working = code;
			// Cross-module constant propagation: resolve this module's import
			// bindings against the per-build exported-const registry (HMR-aware).
			const importedConstants = crossModuleResolver.importedScope(
				id,
				parseProgramForConsts(working, id),
			);
			const result = inlineTwCalls(working, id, config, imports.localNames, importedConstants);
			working = result.code;

			// cx pass runs on the post-tw code: folded tw() strings then
			// participate as plain string arguments to cx(). With css folding
			// configured, literal css()/css.class() atoms compile through the
			// shared engine context and merge via its registry.
			const cxImports = findCxImports(working, id, isCxSource);
			let inlined = result.inlined;
			if (cxImports.localNames.size > 0) {
				let cxOptions: Parameters<typeof inlineCxCalls>[4] = { importedConstants };
				if (cssFold !== undefined) {
					const cssNames = findCssImports(working, id, cssFold.cssSources);
					if (cssNames.size > 0) {
						cxOptions = { importedConstants, fold: { cssNames, engine: cssFold.engine } };
					}
				}
				const cxResult = inlineCxCalls(working, id, config, cxImports.localNames, cxOptions);
				working = cxResult.code;
				inlined += cxResult.inlined;
			}

			return inlined === 0 ? null : { code: working, map: null };
		},
		handleHotUpdate(ctx: { file: string }) {
			// Re-analyze changed modules so propagated constants stay fresh.
			crossModuleResolver.invalidate(ctx.file);
		},
	};
}

export { type PandwindCssViteOptions, pandwindCssVite } from "./css.ts";
export {
	createPandwindEngineContext,
	type PandwindEngineContext,
	type PandwindEngineContextOptions,
} from "./engine-context.ts";
