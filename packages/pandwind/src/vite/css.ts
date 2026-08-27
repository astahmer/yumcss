/**
 * pandwind css() static extractor — generates the atomic stylesheet at build
 * time from literal `css(...)` calls, instead of accumulating it at runtime.
 *
 * ```ts
 * // vite.config.ts
 * import { pandwindCssVite } from "pandwind/vite";
 * import { examplePreset } from "./src/preset";
 *
 * export default defineConfig({
 *   plugins: [pandwindCssVite(examplePreset)],
 * });
 * ```
 *
 * ```ts
 * // main.tsx — the generated CSS is served as a virtual module
 * import "pandwind:css";
 * ```
 *
 * Source files are scanned directly (like Tailwind's own scanner, and like
 * `tw:scan` for the safelist) rather than collected from transforms — module
 * load order varies between dev and build, and the virtual stylesheet must be
 * complete no matter when it is requested. Every `css({ ... })` call with a
 * literal object is resolved through the design layer and its atomic rule is
 * added to a shared stylesheet; the virtual module serves the deduped CSS
 * (tokens + rules). The runtime hashes the same calls deterministically, so
 * runtime class names always match. Calls with dynamic arguments are skipped
 * — they need runtime styles, the same limitation as dynamic class names in
 * plain Tailwind.
 *
 * This is a thin vite wrapper over the bundler-agnostic core in css-core.ts;
 * other bundlers are served by `pandwindUnpluginCss` (src/unplugin.ts).
 */
import type {
	AnyCssConfig,
	AnyTokens,
	CssConfigReturn,
	DefinePresetOptions,
} from "../types/typings.ts";
import type { ModuleNode } from "vite";
import { createCssExtractorPluginCore } from "./css-core.ts";
import type { PandwindEngineContext } from "./engine-context.ts";
import type { AnyClassNameStrategy } from "../css/class-name-strategy.ts";

export interface PandwindCssViteOptions {
	/**
	 * Import sources that point at the css() module. Defaults to any source
	 * whose basename is `css` or `design` (`./css`, `./design.ts`, ...).
	 */
	cssSources?: Array<string | RegExp>;
	/** Files to skip, as regexes matched against the module id. */
	exclude?: RegExp[];
	/** Files to scan, as regexes matched against the absolute path. */
	include?: RegExp[];
	/**
	 * Opt-in per-route CSS splitting (plans/014 §2). Each file belongs to
	 * the FIRST route whose `match` regex hits its absolute path; unmatched
	 * files feed the common chunk. Atoms used by more than one route (and
	 * all common-bucket atoms) stay in the base `pandwind:css` sheet;
	 * route-exclusive atoms are served from `pandwind:css?route=<name>`.
	 * The virtual module `pandwind:css-manifest` exports the route -> id
	 * map. Off by default: without this option one global sheet is served.
	 */
	splitByRoute?: Array<{
		match: RegExp;
		name: string;
		/** Built HTML entry (root-relative) to inline this route's critical CSS into at build time. Requires inlineCritical. */ html?: string;
	}>;
	/**
	 * Critical-CSS inlining (plans/014 §2a): at build time, write each
	 * route's chunk (common + exclusive) into the entry HTML given by that
	 * route's `html` path. Opt-in; capBytes guards oversized payloads.
	 */
	inlineCritical?: true | { capBytes?: number };
	/** Prepend a dev-only origin manifest comment to the generated sheet. */
	debug?: boolean;
	/** Directory scanned for css() calls. Defaults to process.cwd(). */
	root?: string;
	/** The virtual module id the generated CSS is served under. */
	virtualId?: string;
	/**
	 * Tailwind mode: when a class-name strategy (the `createTwAdapter`
	 * output) is supplied, literal `css(...)` / `css.class(...)` calls are
	 * inlined into Tailwind class strings instead of extracted into an
	 * atomic stylesheet. Tailwind's own scanner then generates the CSS, so
	 * `css()` and `tw()` share one rule set and the stylesheet cannot grow.
	 * The virtual `pandwind:css` module serves empty CSS in this mode.
	 *
	 * Sheet-backed strategies (e.g. `createNamedAtomsStrategy`) also swap
	 * the emitted class names, but their classes are compiled by this
	 * plugin's own generated stylesheet — the virtual module serves it.
	 */
	className?: AnyClassNameStrategy;
	/**
	 * Shared engine context (createPandwindEngineContext). When supplied it
	 * must carry the same preset, and its class-name strategy wins over
	 * `className` — pass the SAME context to `pandwindVite({ css })` to wire
	 * both plugins to one configuration source.
	 */
	engine?: PandwindEngineContext;
}

export type CssExtractorPreset = CssConfigReturn<DefinePresetOptions<AnyCssConfig, AnyTokens>>;

/**
 * Create the css() static extractor. The preset must be the same object
 * passed to `createDesignCss` in app code — it drives both resolution and
 * token output, so the generated CSS matches the runtime byte-for-byte.
 */
export function pandwindCssVite(preset: CssExtractorPreset, options: PandwindCssViteOptions = {}) {
	const core = createCssExtractorPluginCore(preset, options);

	return {
		name: core.name,
		enforce: "pre" as const,
		transform: core.transform,
		configResolved: core.configResolved?.bind(core),
		closeBundle: core.closeBundle?.bind(core),
		resolveId(source: string) {
			return core.resolveId(source);
		},
		load(id: string) {
			return core.load(id);
		},
		handleHotUpdate(ctx: {
			file: string;
			modules?: ModuleNode[];
			server?: { moduleGraph: { getModuleById(id: string): ModuleNode | undefined } };
		}): ModuleNode[] | undefined {
			core.invalidate(ctx.file);
			const virtual = ctx.server?.moduleGraph.getModuleById(
				`\0${options.virtualId ?? "pandwind:css"}.css`,
			);
			if (virtual === undefined) return ctx.modules;
			return [...(ctx.modules ?? []), virtual];
		},
		/** Programmatic invalidation (tests, custom HMR wiring). */
		invalidate(file: string) {
			core.invalidate(file);
		},
	};
}

export type { CssExtractorPreset } from "./css-extract.ts";
