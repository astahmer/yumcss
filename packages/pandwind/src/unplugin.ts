/**
 * unplugin adapters — the same pandwind build passes, portable across
 * vite / rollup / webpack / rspack / esbuild / rolldown / farm / bun.
 *
 * ```ts
 * // vite.config.ts (equivalent to pandwindVite + pandwindCssVite)
 * import { pandwindUnplugin, pandwindUnpluginCss } from "pandwind/unplugin";
 *
 * export default defineConfig({
 *   plugins: [pandwindUnplugin(), pandwindUnpluginCss(examplePreset)],
 * });
 * ```
 *
 * ```ts
 * // rollup.config.mjs
 * import { pandwindRollup, pandwindRollupCss } from "pandwind/unplugin";
 *
 * export default {
 *   plugins: [pandwindRollup({ css: { preset } }), pandwindRollupCss(preset)],
 * };
 * ```
 *
 * ## Resolver note
 *
 * The inline pass resolves each file's generated tw module to extract its
 * conflict/compose metadata. Under vite that uses vite's own module graph
 * resolver. Other bundlers have no shared resolve API inside `transform`, so
 * the unplugin adapter falls back to filesystem resolution of relative
 * sources (extension + index probing). Bare-specifier or alias-imported tw
 * modules are not supported there — import them relatively (the common
 * app layout already does).
 *
 * ## Virtual modules & HMR
 *
 * The css extractor's virtual module (`pandwind:css`) is resolved/loaded via
 * unplugin's `resolveId`/`load` hooks; rollup/vite/rolldown understand the
 * `\0`-prefixed id convention natively. Cache invalidation uses unplugin's
 * cross-bundler `watchChange`; under vite the `.vite.handleHotUpdate` slice
 * additionally triggers immediate re-requests.
 */
import { statSync } from "node:fs";
import { dirname, join } from "node:path";
import { createUnplugin } from "unplugin";
import { createInlineTwPluginCore } from "./vite/index.ts";
import type { PandwindViteOptions, Resolver } from "./vite/index.ts";
import { createCssExtractorPluginCore } from "./vite/css-core.ts";
import type { CssExtractorPreset, PandwindCssViteOptions } from "./vite/css.ts";

const MODULE_EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".jsx", ".mjs"];

/**
 * Filesystem-based stand-in for bundler resolvers: probes relative sources
 * with common extensions and index files. Returns `null` for bare specifiers
 * (aliases/bare imports need the host bundler's graph and are unsupported in
 * the generic adapters — fold nothing rather than guess).
 */
function createFsResolver(): Resolver {
	return {
		resolve(source: string, importer: string) {
			if (!source.startsWith(".") && !source.startsWith("/")) return null;
			const base = source.startsWith("/") ? source : join(dirname(importer), source);
			const candidates = [
				base,
				...MODULE_EXTENSIONS.map((ext) => base + ext),
				...MODULE_EXTENSIONS.map((ext) => join(base, `index${ext}`)),
			];
			for (const candidate of candidates) {
				try {
					if (statSync(candidate).isFile()) return { id: candidate };
				} catch {
					// probe next candidate
				}
			}
			return null;
		},
	};
}

// One fs resolver per plugin instance keeps behavior predictable; the core's
// config cache is per-instance anyway.
const inlineFsResolver = createFsResolver();

export type PandwindUnpluginOptions = PandwindViteOptions;

/**
 * Inline-tw pass as a universal unplugin. Equivalent to `pandwindVite`
 * under vite; works on any unplugin-supported bundler.
 */
export const pandwindUnplugin = createUnplugin((options: PandwindUnpluginOptions = {}) => {
	const core = createInlineTwPluginCore(options);
	return {
		name: core.name,
		enforce: "pre" as const,
		transform(code: string, id: string) {
			return core.transform(code, id, inlineFsResolver);
		},
		watchChange(id: string) {
			core.invalidate(id);
		},
		vite: {
			handleHotUpdate(ctx: { file: string }) {
				core.invalidate(ctx.file);
			},
		},
	};
});

export interface PandwindUnpluginCssOptions extends PandwindCssViteOptions {
	/** The app's design preset — required (there is no default preset). */
	preset: CssExtractorPreset;
}

/**
 * css() static extractor as a universal unplugin. Equivalent to
 * `pandwindCssVite` under vite. In tailwind mode (`className` strategy)
 * the transform inlines literal css() calls; otherwise the virtual
 * `<virtualId>` module serves the generated stylesheet.
 */
export const pandwindUnpluginCss = createUnplugin((options: PandwindUnpluginCssOptions) => {
	const core = createCssExtractorPluginCore(options.preset, options);
	return {
		name: core.name,
		enforce: "pre" as const,
		transform: core.transform,
		resolveId(source: string) {
			return core.resolveId(source);
		},
		load(id: string) {
			return core.load(id);
		},
		watchChange(id: string) {
			core.invalidate(id);
		},
		vite: {
			handleHotUpdate(ctx: { file: string }) {
				core.invalidate(ctx.file);
			},
		},
	};
});

/** Rollup slice — `pandwindRollup(...)` is a standard rollup plugin. */
export const pandwindRollup = pandwindUnplugin.rollup;
/** Rollup slice of the css extractor. */
export const pandwindRollupCss = pandwindUnpluginCss.rollup;
/** Webpack plugin — pass to `plugins:` in webpack config. */
export const pandwindWebpack = pandwindUnplugin.webpack;
/** Webpack plugin of the css extractor. */
export const pandwindWebpackCss = pandwindUnpluginCss.webpack;
