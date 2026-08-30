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
import { realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createUnplugin } from "unplugin";
import type { HmrContext, ModuleNode } from "vite";
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
			handleHotUpdate(ctx: HmrContext) {
				core.invalidate(ctx.file);
				return ctx.modules;
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
	const virtualId = options.virtualId ?? "pandwind:css";
	const include = options.include ?? [/\.(?:[cm]?[jt]sx?)$/];
	const exclude = options.exclude ?? [/node_modules/, /(^|\/)dist(\/|$)/, /\.git/];
	const plugin: {
		name: string;
		enforce: "pre";
		transformInclude: (id: string) => boolean;
		transform: typeof core.transform;
		loadInclude: (id: string) => boolean;
		resolveId: (source: string) => string | null;
		load: (id: string) => string | null;
		watchChange: (id: string) => void;
		vite: { handleHotUpdate(ctx: HmrContext): ModuleNode[] | undefined };
		webpack?: (compiler: unknown) => void;
	} = {
		name: core.name,
		enforce: "pre" as const,
		transformInclude(id: string) {
			return (
				include.some((pattern) => pattern.test(id)) && !exclude.some((pattern) => pattern.test(id))
			);
		},
		transform: core.transform,
		loadInclude(id: string) {
			return id.includes(virtualId) || id.includes(encodeURIComponent(`\0${virtualId}.css`));
		},
		resolveId(source: string) {
			return core.resolveId(source);
		},
		load(id: string) {
			const encodedVirtualId = encodeURIComponent(`\0${virtualId}.css`);
			return core.load(id.endsWith(encodedVirtualId) ? `\0${virtualId}.css` : id);
		},
		watchChange(id: string) {
			core.invalidate(id);
		},
		webpack(compiler: any) {
			// Next's CSS resolver does not always run webpack's ordinary
			// resolve.plugins chain. Re-route the bare virtual stylesheet through
			// unplugin's already-installed virtual module when that happens.
			compiler.hooks.normalModuleFactory.tap("pandwind-css", (factory: any) => {
				factory.hooks.beforeResolve.tapAsync("pandwind-css", (data: any, done: any) => {
					if (data?.request !== virtualId) {
						done(null);
						return;
					}
					const resolved = core.resolveId(virtualId);
					if (resolved === null) {
						done(null);
						return;
					}
					const virtualPath = resolve(
						compiler.context ?? process.cwd(),
						"_virtual_",
						encodeURIComponent(resolved),
					);
					const virtualModules = compiler.options.plugins.find(
						(candidate: any) => typeof candidate.writeModule === "function",
					);
					virtualModules?.writeModule?.(virtualPath, "");
					data.request = virtualPath;
					done(null);
				});
			});
		},
		vite: {
			handleHotUpdate(ctx: HmrContext) {
				core.invalidate(ctx.file);
				const virtual = ctx.server.moduleGraph.getModuleById(
					`\0${options.virtualId ?? "pandwind:css"}.css`,
				);
				return virtual === undefined ? ctx.modules : [...ctx.modules, virtual];
			},
		},
	};

	// Webpack rejects URI-like imports such as `pandwind:css` before the
	// resolver hook generated by unplugin can see them. Install a small
	// resolver bridge ahead of that hook, mapping the public id to the same
	// unplugin virtual file that its load loader understands.
	plugin.webpack = function (compiler: unknown) {
		type WebpackCallback = (error?: unknown, result?: unknown) => void;
		const state = this as unknown as {
			__virtualModulePrefix?: string;
			__vfs?: { writeModule(path: string, source: string): void };
			__vfsModules?: Set<string>;
		};
		const webpackCompiler = compiler as {
			options: {
				context?: string;
				resolve: { plugins?: Array<{ apply(resolver: unknown): void }> };
			};
		};
		const publicId = options.virtualId ?? "pandwind:css";
		const resolvedId = `\0${publicId}.css`;
		const contextPath = realpathSync(webpackCompiler.options.context ?? process.cwd());
		const prefix = resolve(contextPath, "_virtual_");
		const virtualPath = prefix + encodeURIComponent(resolvedId);
		const compilerWithFactory = compiler as {
			hooks?: {
				normalModuleFactory?: {
					tap(name: string, fn: (factory: unknown) => void): void;
				};
			};
		};
		compilerWithFactory.hooks?.normalModuleFactory?.tap(
			"pandwind:webpack-virtual-css",
			(factory) => {
				const normalModuleFactory = factory as {
					hooks?: {
						beforeResolve?: {
							tap(name: string, fn: (data: { request?: string }) => void): void;
						};
					};
				};
				normalModuleFactory.hooks?.beforeResolve?.tap("pandwind:webpack-virtual-css", (data) => {
					if (data.request !== publicId) return;
					state.__vfs?.writeModule(virtualPath, "");
					state.__vfsModules?.add(virtualPath);
					data.request = virtualPath;
				});
			},
		);
		const resolverPlugin = {
			apply(resolver: unknown) {
				const webpackResolver = resolver as {
					ensureHook(name: string): unknown;
					getHook(name: string): {
						tapAsync(
							name: string,
							handler: (
								request: { request?: string },
								context: unknown,
								callback: WebpackCallback,
							) => void,
						): void;
					};
					doResolve(
						target: unknown,
						request: unknown,
						title: null,
						context: unknown,
						callback: WebpackCallback,
					): void;
				};
				const target = webpackResolver.ensureHook("resolve");
				webpackResolver
					.getHook("resolve")
					.tapAsync(
						"pandwind:webpack-virtual-css",
						(request: { request?: string }, context: unknown, callback: WebpackCallback) => {
							if (request.request !== publicId) return callback();
							webpackResolver.doResolve(
								target,
								{ ...request, request: virtualPath },
								null,
								context,
								callback,
							);
						},
					);
			},
		};
		webpackCompiler.options.resolve.plugins = [
			resolverPlugin,
			...(webpackCompiler.options.resolve.plugins ?? []),
		];
	};

	return plugin;
});

/** Rollup slice — `pandwindRollup(...)` is a standard rollup plugin. */
export const pandwindRollup = pandwindUnplugin.rollup;
/** Rollup slice of the css extractor. */
export const pandwindRollupCss = pandwindUnpluginCss.rollup;
/** Webpack plugin — pass to `plugins:` in webpack config. */
export const pandwindWebpack = pandwindUnplugin.webpack;
/** Webpack plugin of the css extractor. */
export const pandwindWebpackCss = pandwindUnpluginCss.webpack;
