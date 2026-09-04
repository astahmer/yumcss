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
 * can still be covered by the `pandwind-tw scan` safelist.
 */
import { basename } from "node:path";
import { SOURCE_SCANNER_SERVICE } from "../source-scanner.ts";
import { createSourceWorkspace } from "../source-workspace.ts";
import { walk } from "../tw/literal.ts";
import { findCxImports, inlineCxCalls } from "./cx-inline.ts";
import { createCrossModuleConstResolver } from "./cross-module-consts.ts";
import { type OxcNode } from "../tw/literal.ts";
import { createCssSourceService } from "./css-source-service.ts";
import { createPandwindEngineContext, type PandwindEngineContext } from "./engine-context.ts";
import type { ClassNameStrategy } from "../css/class-name-strategy.ts";
import type { CssPreset } from "./css-extract.ts";
import {
	extractTwConfig,
	inlineTwCalls,
	OnUnresolvedTag,
	type OnUnresolved,
	type TwConfig,
} from "./inline.ts";
import type { UnresolvedToken } from "./unresolved.ts";
import { createRuntimePruningTransform } from "./runtime-pruner.ts";

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
		className?: ClassNameStrategy;
		/** Shared engine context — see createPandwindEngineContext. */
		engine?: PandwindEngineContext;
		/**
		 * Import sources pointing at css/design modules. Defaults to any
		 * source whose basename is `css` or `design`.
		 */
		cssSources?: Array<string | RegExp>;
	};
	/**
	 * Fail-fast policy for statically-folded class tokens that are NOT part
	 * of the design system: arbitrary `[...]` values (compile fine but
	 * bypass the token vocabulary) and tokens Tailwind will not compile
	 * (they render unstyled). Only fully-folded cx()/tw() call sites are
	 * checked; custom/foreign classes passed through cx() will false-positive.
	 *
	 * - "off" (default): do nothing;
	 * - "warn": report each site via console.warn and keep building;
	 * - "error": throw — the build fails on the offending module.
	 */
	onUnresolved?: OnUnresolved;
	/**
	 * Receive the class candidates that bounded dynamic `tw()` calls
	 * (ternaries, unions, finite constant sets) and unfolded finite `cx()`
	 * calls may produce at runtime. The host registers them with the
	 * Tailwind scanner (`@source inline` or the `pandwind-tw scan`
	 * safelist) so every possible class has CSS. Duplicates across the
	 * tw/cx lanes and repeated modules are already removed here; the host
	 * only needs to accumulate or forward each batch.
	 */
	onTwCandidates?: (candidates: readonly string[]) => void;
}

export interface Resolver {
	resolve(
		source: string,
		importer: string,
		options?: { skipSelf?: boolean },
	): Promise<{ id: string } | null> | { id: string } | null | undefined;
}

interface ImportInfo {
	localNames: Set<string>;
	sources: string[];
	program: OxcNode;
}

/** Collect local bindings imported from tw modules in `code`. */
function findTwImports(
	code: string,
	id: string,
	isTwSource: (source: string) => boolean,
): ImportInfo {
	if (!SOURCE_SCANNER_SERVICE.isScriptFile(id))
		return {
			localNames: new Set(),
			sources: [],
			program: { type: "Program", body: [] } as unknown as OxcNode,
		};
	const result = SOURCE_SCANNER_SERVICE.parse({ file: id, source: code });
	const program = result.program as unknown as OxcNode;
	const info = { localNames: new Set<string>(), sources: [] as string[] };

	walk(program, (node) => {
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
	return { ...info, program };
}

interface OxcSpecifier {
	type: string;
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
	return basename(source).split(".")[0] === fallbackBasename;
}

/**
 * Bundler-agnostic core of the inline-tw plugin: everything except the
 * vite-specific `this` resolver binding. Shared by `pandwindVite` and the
 * unplugin adapters (`pandwindUnplugin`, `pandwindRollup`, ...) which supply
 * their own config-resolution strategy.
 */
export interface InlineTwPluginCore {
	name: string;
	/**
	 * `resolver` is optional: bundlers with a module graph (vite/rollup)
	 * pass their native resolver; simpler integrations pass nothing and the
	 * caller has already resolved configs some other way.
	 */
	transform(
		code: string,
		id: string,
		resolver?: Resolver,
	): Promise<{ code: string; map: null } | null>;
	/** Drop cached analysis for `file` so propagated constants stay fresh. */
	invalidate(file: string): void;
	resolveId(source: string): string | null;
	load(id: string): string | null;
}

const reportUnresolved = (id: string, unresolved: UnresolvedToken[], mode: OnUnresolved): void => {
	if (unresolved.length === 0) return;
	const sites = unresolved
		.map((site) => `  ${id}:${site.line}: "${site.token}" (${site.reason})`)
		.join("\n");
	const message =
		`pandwind: ${unresolved.length} folded class token(s) outside the design system:\n${sites}\n` +
		"Arbitrary [...] values bypass the token vocabulary; unknown tokens render unstyled. " +
		'Set onUnresolved: "off" to silence.';
	if (mode === OnUnresolvedTag.Error) throw new Error(message);
	console.warn(message);
};

export function createInlineTwPluginCore(options: PandwindViteOptions = {}): InlineTwPluginCore {
	const configCache = new Map<string, TwConfig>();
	const transformCache = new Map<string, { result: { code: string; map: null } | null }>();
	const cacheKeyFor = (id: string, code: string): string => `${id}\0${code}`;
	const remember = (key: string, result: { code: string; map: null } | null): void => {
		if (transformCache.size >= 2048) transformCache.clear();
		transformCache.set(key, { result });
	};
	const sourceWorkspace = createSourceWorkspace();

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
	const cssSourceService = createCssSourceService();
	const runtimePruner = createRuntimePruningTransform();

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
		const sourceCode = sourceWorkspace.read([resolved.id])[0]?.source;
		if (sourceCode === undefined) return undefined;
		const config = extractTwConfig(sourceCode);
		if (config !== undefined) configCache.set(resolved.id, config);
		return config;
	};

	const crossModuleResolver = createCrossModuleConstResolver();
	const unresolvedMode: OnUnresolved = options.onUnresolved ?? OnUnresolvedTag.Off;
	const unresolvedOptions = { onUnresolved: unresolvedMode };
	const reportTwCandidates = options.onTwCandidates;
	// Cross-lane, cross-module candidate dedup: the tw and cx lanes may
	// discover the same finite classes in the same or different modules;
	// the Tailwind scanner only needs each candidate once per build.
	const reportedCandidates = new Set<string>();
	const reportCandidates = (candidates: readonly string[]): void => {
		if (reportTwCandidates === undefined) return;
		const fresh = candidates.filter((candidate) => !reportedCandidates.has(candidate));
		if (fresh.length === 0) return;
		for (const candidate of fresh) reportedCandidates.add(candidate);
		reportTwCandidates(fresh);
	};

	return {
		name: "pandwind:inline-tw",
		async transform(code: string, id: string, resolver?: Resolver) {
			if (id.includes("node_modules")) return null;
			if (options.exclude?.some((pattern) => pattern.test(id))) return null;
			const cacheKey = cacheKeyFor(id, code);
			const cached = transformCache.get(cacheKey);
			if (cached !== undefined) return cached.result;
			if (!/\b(tw|cx)\b/.test(code)) {
				const result = runtimePruner.transform(code, id);
				remember(cacheKey, result);
				return result;
			}

			const imports = findTwImports(code, id, isTwSource);
			if (imports.localNames.size === 0 && imports.sources.length === 0) {
				// A cx import without a tw import can't be folded safely: the
				// generated conflict/compose metadata is what makes build-time
				// output provably identical to the runtime merge.
				const result = runtimePruner.transform(code, id);
				remember(cacheKey, result);
				return result;
			}
			if (resolver === undefined) return null;

			let config: TwConfig | undefined;
			// Sequential short-circuit: stop at the first source that resolves
			// to a generated tw module. Promise.all would load them needlessly.
			for (const source of imports.sources) {
				config = await loadConfig(resolver, id, source);
				if (config !== undefined) break;
			}
			if (config === undefined) return null;

			let working = code;
			// Cross-module constant propagation: resolve this module's import
			// bindings against the per-build exported-const registry (HMR-aware).
			const importedConstants = crossModuleResolver.importedScope(id, imports.program);
			const result = inlineTwCalls(working, id, config, imports.localNames, importedConstants, {
				...unresolvedOptions,
				parsedProgram: imports.program,
			});
			working = result.code;
			if (result.candidates?.length) reportCandidates(result.candidates);

			// cx pass runs on the post-tw code: folded tw() strings then
			// participate as plain string arguments to cx(). With css folding
			// configured, literal css()/css.class() atoms compile through the
			// shared engine context and merge via its registry.
			const cxImports = findCxImports(
				working,
				id,
				isCxSource,
				result.inlined === 0 ? imports.program : undefined,
			);
			let inlined = result.inlined;
			let cxUnresolved: UnresolvedToken[] = [];
			if (cxImports.localNames.size > 0) {
				let cxOptions: Parameters<typeof inlineCxCalls>[4] = {
					importedConstants,
					onUnresolved: unresolvedMode,
				};
				if (cssFold !== undefined) {
					const cssNames = cssSourceService.findCssImports(working, id, cssFold.cssSources);
					if (cssNames.size > 0) {
						cxOptions = {
							...cxOptions,
							fold: { cssNames, engine: cssFold.engine },
						};
					}
				}
				const cxResult = inlineCxCalls(working, id, config, cxImports.localNames, {
					...cxOptions,
					parsedProgram: cxImports.program,
				});
				working = cxResult.code;
				inlined += cxResult.inlined;
				cxUnresolved = cxResult.unresolved ?? [];
				if (cxResult.candidates?.length) reportCandidates(cxResult.candidates);
			}

			const optimized = runtimePruner.transform(working, id);
			if (optimized !== null) working = optimized.code;

			const transformed =
				inlined === 0 && optimized === null
					? null
					: (() => {
							if (unresolvedMode !== OnUnresolvedTag.Off) {
								reportUnresolved(
									id,
									[...(result.unresolved ?? []), ...cxUnresolved],
									unresolvedMode,
								);
							}
							return { code: working, map: null } as const;
						})();
			remember(cacheKey, transformed);
			return transformed;
		},
		invalidate(file: string) {
			crossModuleResolver.invalidate(file);
			configCache.delete(file);
			// A changed module may be an imported constant or a generated tw
			// module, so its dependants cannot be identified from the transformed
			// module id alone. Clear the bounded result cache at the dependency
			// boundary; the next transform rebuilds only the modules requested by
			// the host.
			transformCache.clear();
		},
		resolveId(source: string) {
			return runtimePruner.resolveId(source);
		},
		load(id: string) {
			return runtimePruner.load(id);
		},
	};
}

/**
 * Create the vite plugin. The transform is idempotent: already-inlined string
 * literals are never tw calls, so repeated runs are safe.
 */
export function pandwindVite(options: PandwindViteOptions = {}) {
	const core = createInlineTwPluginCore(options);
	return {
		name: core.name,
		enforce: "pre",
		transform(this: Resolver, code: string, id: string) {
			return core.transform(code, id, this);
		},
		handleHotUpdate(ctx: { file: string }) {
			// Re-analyze changed modules so propagated constants stay fresh.
			core.invalidate(ctx.file);
		},
		resolveId(source: string) {
			return core.resolveId(source);
		},
		load(id: string) {
			return core.load(id);
		},
	};
}

export { type PandwindCssViteOptions, pandwindCssVite } from "./css.ts";
export {
	createPandwindEngineContext,
	type PandwindEngineContext,
	type PandwindEngineContextOptions,
} from "./engine-context.ts";
