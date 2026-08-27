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
import { parseSourceProgram } from "../source-scanner.ts";
import { walk } from "../tw/literal.ts";
import { findCxImports, inlineCxCalls } from "./cx-inline.ts";
import { createCrossModuleConstResolver } from "./cross-module-consts.ts";
import { type OxcNode } from "../tw/literal.ts";
import { createCssSourceService } from "./css-source-service.ts";
import { createPandwindEngineContext, type PandwindEngineContext } from "./engine-context.ts";
import type { AnyClassNameStrategy } from "../css/class-name-strategy.ts";
import type { CssPreset } from "./css-extract.ts";
import { extractTwConfig, inlineTwCalls, type OnUnresolved, type TwConfig } from "./inline.ts";
import type { UnresolvedToken } from "./unresolved.ts";

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
	/**
	 * Fail-fast policy for statically-folded class tokens that are NOT part
	 * of the design system: arbitrary `[...]` values (compile fine but
	 * bypass the token vocabulary) and tokens Tailwind will not compile
	 * (they render unstyled). Only fully-folded cx()/tw() call sites are
	 * checked; custom/foreign classes passed through cx() will false-positive.
	 *
	 * - "off" (default, backwards compatible): do nothing;
	 * - "warn": report each site via console.warn and keep building;
	 * - "error": throw — the build fails on the offending module.
	 */
	onUnresolved?: OnUnresolved;
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
}

/** Collect local bindings imported from tw modules in `code`. */
function findTwImports(
	code: string,
	id: string,
	isTwSource: (source: string) => boolean,
): ImportInfo {
	const result = parseSourceProgram({ file: id, source: code });
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

/** Source-matcher shared by the tw and cx import detection. */
/** Parse a module and return its program node (for const-binding scans). */
function parseProgramForConsts(code: string, id: string): OxcNode {
	const parsed = parseSourceProgram({ file: id, source: code }) as unknown as { program: OxcNode };
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
	if (mode === "error") throw new Error(message);
	console.warn(message);
};

export function createInlineTwPluginCore(options: PandwindViteOptions = {}): InlineTwPluginCore {
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
	const cssSourceService = createCssSourceService();

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
	const unresolvedMode: OnUnresolved = options.onUnresolved ?? "off";
	const unresolvedOptions = { onUnresolved: unresolvedMode };

	return {
		name: "pandwind:inline-tw",
		async transform(code: string, id: string, resolver?: Resolver) {
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
			if (resolver === undefined) return null;

			let config: TwConfig | undefined;
			// Sequential short-circuit: stop at the first source that resolves
			// to a generated tw module. Promise.all would load them needlessly.
			for (const source of imports.sources) {
				// oxlint-disable-next-line no-await-in-loop
				config = await loadConfig(resolver, id, source);
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
			const result = inlineTwCalls(
				working,
				id,
				config,
				imports.localNames,
				importedConstants,
				unresolvedOptions,
			);
			working = result.code;

			// cx pass runs on the post-tw code: folded tw() strings then
			// participate as plain string arguments to cx(). With css folding
			// configured, literal css()/css.class() atoms compile through the
			// shared engine context and merge via its registry.
			const cxImports = findCxImports(working, id, isCxSource);
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
				const cxResult = inlineCxCalls(working, id, config, cxImports.localNames, cxOptions);
				working = cxResult.code;
				inlined += cxResult.inlined;
				cxUnresolved = cxResult.unresolved ?? [];
			}

			return inlined === 0
				? null
				: (() => {
						if (unresolvedMode !== "off") {
							reportUnresolved(id, [...(result.unresolved ?? []), ...cxUnresolved], unresolvedMode);
						}
						return { code: working, map: null } as const;
					})();
		},
		invalidate(file: string) {
			crossModuleResolver.invalidate(file);
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
	};
}

export { type PandwindCssViteOptions, pandwindCssVite } from "./css.ts";
export {
	createPandwindEngineContext,
	type PandwindEngineContext,
	type PandwindEngineContextOptions,
} from "./engine-context.ts";
