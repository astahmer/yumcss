/**
 * unplugin adapters — the same yumcss build passes, portable across
 * vite / rollup / webpack / rspack / esbuild / rolldown / farm / bun.
 *
 * ```ts
 * // vite.config.ts (equivalent to yumcssVite + yumcssExtractVite)
 * import { yumcssUnplugin, yumcssUnpluginCss } from "yumcss/unplugin";
 *
 * export default defineConfig({
 *   plugins: [yumcssUnplugin(), yumcssUnpluginCss(examplePreset)],
 * });
 * ```
 *
 * ```ts
 * // rollup.config.mjs
 * import { yumcssRollup, yumcssRollupCss } from "yumcss/unplugin";
 *
 * export default {
 *   plugins: [yumcssRollup({ css: { preset } }), yumcssRollupCss(preset)],
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
 * The css extractor's virtual module (`yumcss:css`) is resolved/loaded via
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
import type { YumCSSViteOptions, Resolver } from "./vite/index.ts";
import { createCssExtractorPluginCore } from "./vite/css-core.ts";
import type { CssExtractorPreset, YumCSSExtractViteOptions } from "./vite/css.ts";

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

export type YumCSSUnpluginOptions = YumCSSViteOptions;

/**
 * Inline-tw pass as a universal unplugin. Equivalent to `yumcssVite`
 * under vite; works on any unplugin-supported bundler.
 */
export const yumcssUnplugin = createUnplugin((options: YumCSSUnpluginOptions = {}) => {
	const core = createInlineTwPluginCore(options);
	const resolver = createFsResolver();
	return {
		name: core.name,
		enforce: "pre" as const,
		transform(code: string, id: string) {
			return core.transform(code, id, resolver);
		},
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
			handleHotUpdate(ctx: HmrContext) {
				core.invalidate(ctx.file);
				return ctx.modules;
			},
		},
	};
});

export interface YumCSSUnpluginCssOptions extends Omit<YumCSSExtractViteOptions, "libraries"> {
	/** The app's design preset — required (there is no default preset). */
	preset: CssExtractorPreset;
}

/**
 * css() static extractor as a universal unplugin. Equivalent to
 * `yumcssExtractVite` under vite. In tailwind mode (`className` strategy)
 * the transform inlines literal css() calls; otherwise the virtual
 * `<virtualId>` module serves the generated stylesheet.
 */
export const yumcssUnpluginCss = createUnplugin((options: YumCSSUnpluginCssOptions) => {
	const core = createCssExtractorPluginCore(options.preset, options);
	const virtualId = options.virtualId ?? "yumcss:css";
	const resolvedVirtualId = `\0${virtualId}.css`;
	const encodedVirtualId = encodeURIComponent(resolvedVirtualId);
	const plugin: {
		name: string;
		enforce: "pre";
		transform: typeof core.transform;
		transformInclude: (id: string) => boolean;
		resolveId: (source: string) => string | null;
		load: (id: string) => string | null;
		loadInclude: (id: string) => boolean;
		watchChange: (id: string) => void;
		vite: { handleHotUpdate(ctx: HmrContext): ModuleNode[] | undefined };
		webpack?: (compiler: unknown) => void;
	} = {
		name: core.name,
		enforce: "pre" as const,
		transform: core.transform,
		transformInclude(id: string) {
			const resource = id.split(/[?#]/u, 1)[0]!;
			return MODULE_EXTENSIONS.some((extension) => resource.endsWith(extension));
		},
		resolveId(source: string) {
			return core.resolveId(source);
		},
		load(id: string) {
			return core.load(
				id === resolvedVirtualId || id.endsWith(encodedVirtualId) ? resolvedVirtualId : id,
			);
		},
		loadInclude(id: string) {
			return id === resolvedVirtualId || id.endsWith(encodedVirtualId);
		},
		watchChange(id: string) {
			core.invalidate(id);
		},
		webpack(compiler: any) {
			// Next's CSS resolver does not always run webpack's ordinary
			// resolve.plugins chain. Re-route the bare virtual stylesheet through
			// unplugin's already-installed virtual module when that happens.
			compiler.hooks.normalModuleFactory.tap("yumcss-css", (factory: any) => {
				factory.hooks.beforeResolve.tapAsync("yumcss-css", (data: any, done: any) => {
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
					`\0${options.virtualId ?? "yumcss:css"}.css`,
				);
				return virtual === undefined ? ctx.modules : [...ctx.modules, virtual];
			},
		},
	};

	// Webpack rejects URI-like imports such as `yumcss:css` before the
	// resolver hook generated by unplugin can see them. Install a small
	// resolver bridge ahead of that hook, mapping the public id to the same
	// unplugin virtual file that its load loader understands.
	plugin.webpack = function (compiler: unknown) {
		type WebpackCallback = (error?: unknown, result?: unknown) => void;
		const state = this as {
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
		const publicId = options.virtualId ?? "yumcss:css";
		const contextPath = realpathSync(webpackCompiler.options.context ?? process.cwd());
		const prefix = resolve(contextPath, "_virtual_");
		const runtimePrefix = "yumcss:runtime/css?";
		const virtualPathFor = (source: string): string | undefined => {
			const resolved = core.resolveId(source);
			if (resolved === null) return undefined;
			return prefix + encodeURIComponent(resolved);
		};
		const virtualPath = virtualPathFor(publicId);
		if (virtualPath === undefined) return;
		const isVirtualSource = (source: string | undefined): boolean =>
			source === publicId || source?.startsWith(runtimePrefix) === true;
		const compilerWithFactory = compiler as {
			hooks?: {
				normalModuleFactory?: {
					tap(name: string, fn: (factory: unknown) => void): void;
				};
			};
		};
		compilerWithFactory.hooks?.normalModuleFactory?.tap(
			"yumcss:webpack-virtual-css",
			(factory) => {
				const normalModuleFactory = factory as {
					hooks?: {
						beforeResolve?: {
							tap(name: string, fn: (data: { request?: string }) => void): void;
						};
					};
				};
				normalModuleFactory.hooks?.beforeResolve?.tap("yumcss:webpack-virtual-css", (data) => {
					if (!isVirtualSource(data.request)) return;
					const target = virtualPathFor(data.request!);
					if (target === undefined) return;
					state.__vfs?.writeModule(target, "");
					state.__vfsModules?.add(target);
					data.request = target;
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
						"yumcss:webpack-virtual-css",
						(request: { request?: string }, context: unknown, callback: WebpackCallback) => {
							if (!isVirtualSource(request.request)) return callback();
							const targetPath = virtualPathFor(request.request!);
							if (targetPath === undefined) return callback();
							webpackResolver.doResolve(
								target,
								{ ...request, request: targetPath },
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

/** Rollup slice — `yumcssRollup(...)` is a standard rollup plugin. */
export const yumcssRollup = yumcssUnplugin.rollup;
/** Rollup slice of the css extractor. */
export const yumcssRollupCss = yumcssUnpluginCss.rollup;
/** Webpack plugin — pass to `plugins:` in webpack config. */
export const yumcssWebpack = yumcssUnplugin.webpack;
/** Webpack plugin of the css extractor. */
export const yumcssWebpackCss = yumcssUnpluginCss.webpack;
