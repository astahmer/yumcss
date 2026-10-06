/**
 * yumcss css() static extractor — generates the atomic stylesheet at build
 * time from literal `css(...)` calls, instead of accumulating it at runtime.
 *
 * ```ts
 * // vite.config.ts
 * import { yumcssExtractVite } from "yumcss/vite";
 * import { css } from "./src/css";
 *
 * export default defineConfig({
 *   plugins: [yumcssExtractVite(css)],
 * });
 * ```
 *
 * ```ts
 * // main.tsx — the generated CSS is served as a virtual module
 * import "yumcss:css";
 * ```
 *
 * Build output is finalized against the bundler's emitted module graph, so
 * unreachable files do not contribute rules. Dev requests retain the
 * include-based scan because Vite serves modules on demand. Every static
 * `css({ ... })` call is resolved through the design layer and the generated
 * stylesheet serves deduped CSS (tokens + rules).
 * The runtime hashes the same calls deterministically, so runtime class names
 * always match. Calls with dynamic arguments keep the runtime fallback unless
 * they are a provably safe flat JSX carrier; those carriers are emitted as
 * direct `{ className, style }` objects. `transformDynamicClassName` is the
 * opt-in host rewrite for simple mixed `css.class()` JSX bindings.
 *
 * This is a thin vite wrapper over the bundler-agnostic core in css-core.ts;
 * other bundlers are served by `yumcssUnpluginCss` (src/unplugin.ts).
 */
import type {
	AnyCssConfig,
	AnyTokens,
	CssConfigReturn,
	DefinePresetOptions,
} from "../types/typings.ts";
import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { OutputBundle, PluginContext } from "rollup";
import type { HmrContext, ModuleNode, ResolvedConfig, ViteDevServer } from "vite";
import { createCssExtractorPluginCore } from "./css-core.ts";
import { refreshYumCSSEngineContext, type YumCSSEngineContext } from "./engine-context.ts";
import { findCssFactoryKinds } from "./css-factory-source.ts";
import { findCssCarrierImportSources } from "./css-source-scanner.ts";
import { readCssFactoryMetadata } from "./css-factory-metadata.ts";
import { type CssFactoryKind, type CssFactoryMetadata } from "../css/factory-metadata.ts";
import type { CssFn } from "../css/create-css.ts";
import type { ClassNameStrategy } from "../css/class-name-strategy.ts";
import type { CssCascade } from "../css/cascade.ts";
import type { TokenVariableNames } from "../types/typings.ts";
import {
	checkYumCSSLibCompatibility,
	validateYumCSSLibArtifact,
	type YumCSSLibArtifact,
} from "./lib-artifact.ts";

let nextCssExtractorInstanceId = 0;

export interface YumCSSExtractViteOptions {
	/** Match host stylesheet precedence with StyleX specificity or a native layer. */
	cascade?: CssCascade;
	/**
	 * Import sources that point at the css() module. Defaults to any source
	 * whose basename is `css` or `design` (`./css`, `./design.ts`, ...).
	 * Use disjoint matchers when configuring multiple extractor instances so
	 * each preset owns a separate source lane.
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
	 * all common-bucket atoms) stay in the base `yumcss:css` sheet;
	 * route-exclusive atoms are served from `yumcss:css?route=<name>`.
	 * The virtual module `yumcss:css-manifest` exports the route -> id
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
	/**
	 * Namespace for YumCSS-owned dynamic-value carriers and critical markers.
	 * Keep this equal to the namespace passed to the CSS factory in app code.
	 */
	namespace?: string;
	/**
	 * Opt-in JSX rewrite for mixed `className={css.class({ ... })}` calls.
	 * Scalar dynamic declarations move to `css.vars()` and literal
	 * declarations stay in `css.class()`, with the host changed to a direct
	 * `className`/`style` props spread when the flat carrier is safe. Unsupported
	 * shapes keep the `css.props(css.vars(...))` fallback.
	 */
	transformDynamicClassName?: boolean;
	/** Directory scanned for css() calls. Defaults to process.cwd(). */
	root?: string;
	/** Package specifiers or artifact paths exposing yumcss.lib.json files. */
	libraries?: readonly string[];
	/**
	 * The virtual module id the generated CSS is served under. Use a unique id
	 * for every extractor instance in one Vite config.
	 */
	virtualId?: string;
	/**
	 * Tailwind mode: when a class-name strategy (the `createTwAdapter`
	 * output) is supplied, literal `css(...)` / `css.class(...)` calls are
	 * inlined into Tailwind class strings instead of extracted into an
	 * atomic stylesheet. Tailwind's own scanner then generates the CSS, so
	 * `css()` and `tw()` share one rule set and the stylesheet cannot grow.
	 * The virtual `yumcss:css` module serves empty CSS in this mode.
	 *
	 * Sheet-backed strategies (e.g. `createNamedAtomsStrategy`) also swap
	 * the emitted class names, but their classes are compiled by this
	 * plugin's own generated stylesheet — the virtual module serves it.
	 */
	className?: ClassNameStrategy;
	/** Match the CSS factory's opt-in authored token variable names. */
	tokenVariableNames?: TokenVariableNames;
	/**
	 * Shared engine context (createYumCSSEngineContext). When supplied it
	 * must carry the same preset, and its class-name strategy wins over
	 * `className` — pass the SAME context to `yumcssVite({ css })` to wire
	 * both plugins to one configuration source.
	 */
	engine?: YumCSSEngineContext;
}

export type CssExtractorPreset = CssConfigReturn<DefinePresetOptions<AnyCssConfig, AnyTokens>>;
export type CssViteInput = CssExtractorPreset | CssFn<never>;

type CssHmrContext = Pick<HmrContext, "file"> & Partial<Pick<HmrContext, "modules" | "server">>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const isCssExtractorPreset = (value: unknown): value is CssExtractorPreset => {
	if (!isRecord(value)) return false;
	return (
		isRecord(value.conditions) &&
		isRecord(value.properties) &&
		typeof value.strict === "boolean" &&
		isRecord(value.tokens)
	);
};

type CssFactoryWithPreset = CssFactoryMetadata & { readonly preset: CssExtractorPreset };

const hasCssExtractorPreset = (metadata: CssFactoryMetadata): metadata is CssFactoryWithPreset =>
	isCssExtractorPreset(metadata.preset);

const withoutQuery = (value: string): string => value.split(/[?#]/u, 1)[0]!;

const normalizeFilePath = (value: string): string => {
	const file = resolve(withoutQuery(value));
	try {
		return realpathSync.native(file);
	} catch {
		return file;
	}
};

const moduleContainsFile = (module: ModuleNode, file: string): boolean =>
	module.file !== null && normalizeFilePath(module.file) === file;

const moduleForId = (server: ViteDevServer, id: string): ModuleNode | undefined => {
	const direct = server.moduleGraph.getModuleById(id);
	if (direct !== undefined) return direct;
	return [...(server.moduleGraph.getModulesByFile(id) ?? [])].find((module) =>
		moduleContainsFile(module, id),
	);
};

const compositionModuleIsAffected = (
	file: string,
	compositionModule: string,
	server: ViteDevServer,
): boolean => {
	const changedFile = normalizeFilePath(file);
	if (changedFile === compositionModule) return true;

	const rootModule = moduleForId(server, compositionModule);
	if (rootModule === undefined) return false;

	const pending = [rootModule];
	const visited = new Set<ModuleNode>();
	while (pending.length > 0) {
		const module = pending.pop()!;
		if (visited.has(module)) continue;
		visited.add(module);
		if (moduleContainsFile(module, changedFile)) return true;
		pending.push(...module.importedModules);
	}
	return false;
};

const compositionModulesToUpdate = (
	server: ViteDevServer,
	compositionModules: readonly string[],
): ModuleNode[] => {
	return compositionModules
		.map((compositionModule) => moduleForId(server, compositionModule))
		.filter((module): module is ModuleNode => module !== undefined);
};

const ensureCompositionModuleGraph = async ({
	server,
	compositionModules,
	root,
}: {
	server: ViteDevServer;
	compositionModules: readonly string[];
	root: string;
}): Promise<void> => {
	for (const compositionModule of compositionModules) {
		const module = moduleForId(server, compositionModule);
		if (module !== undefined && module.importedModules.size > 0) continue;
		await server.ssrLoadModule(toViteModuleUrl(compositionModule, root), {
			fixStacktrace: true,
		});
	}
};

const toViteModuleUrl = (file: string, root: string): string => {
	const relativePath = relative(root, file).replaceAll("\\", "/");
	if (relativePath !== "" && !relativePath.startsWith("../")) return `/${relativePath}`;
	return `/@fs/${file.replaceAll("\\", "/")}`;
};

const factoryOptions = (metadata: CssFactoryMetadata | undefined): YumCSSExtractViteOptions => {
	if (metadata === undefined) return {};
	return metadata.options;
};

const isArtifactPath = (value: string): boolean => value.startsWith(".") || value.startsWith("/");

const loadLibraryArtifacts = async ({
	libraries,
	root,
	preset,
	options,
	resolver,
}: {
	libraries: readonly string[];
	root: string;
	preset: CssExtractorPreset;
	options: YumCSSExtractViteOptions;
	resolver: Pick<PluginContext, "resolve">;
}): Promise<readonly YumCSSLibArtifact[]> => {
	const artifacts: YumCSSLibArtifact[] = [];
	for (const library of libraries) {
		const source = isArtifactPath(library) ? library : `${library}/yumcss.lib.json`;
		const resolved = isArtifactPath(library)
			? { id: resolve(root, library) }
			: await resolver.resolve(source, undefined, { skipSelf: true });
		if (resolved === null || resolved === undefined)
			throw new Error(
				`yumcssExtractVite: registered library '${library}' does not expose ${source}; ` +
					"publish yumcss.lib.json and expose it from the package",
			);
		let parsed: unknown;
		try {
			parsed = JSON.parse(readFileSync(resolved.id.split("?", 1)[0]!, "utf8"));
		} catch (error) {
			throw new Error(
				`yumcssExtractVite: could not read YumCSS lib artifact for '${library}': ${error instanceof Error ? error.message : String(error)}`,
				{ cause: error },
			);
		}
		const validation = validateYumCSSLibArtifact(parsed);
		if (!validation.valid || validation.artifact === undefined)
			throw new Error(
				[
					`yumcssExtractVite: invalid YumCSS lib artifact for '${library}'`,
					...validation.errors.map((error) => `- ${error}`),
				].join("\n"),
			);
		const compatibility = checkYumCSSLibCompatibility(validation.artifact, preset, {
			namespace: options.namespace,
			cascade: options.cascade,
			className: options.engine?.className ?? options.className,
		});
		if (!compatibility.compatible)
			throw new Error(
				[
					`yumcssExtractVite: incompatible YumCSS lib artifact for '${library}'`,
					...compatibility.differences.map((difference) => `- ${difference}`),
				].join("\n"),
			);
		artifacts.push(validation.artifact);
	}
	return artifacts;
};

const loadCssFactory = async ({
	server,
	compositionModule,
	kind,
	root,
	currentPreset,
}: {
	server: ViteDevServer;
	compositionModule: string;
	kind: CssFactoryKind | undefined;
	root: string;
	currentPreset: CssExtractorPreset;
}): Promise<CssFactoryWithPreset | undefined> => {
	const namespace = await server.ssrLoadModule(toViteModuleUrl(compositionModule, root), {
		fixStacktrace: true,
	});
	const candidates = Object.values(namespace).flatMap((value) => {
		const metadata = readCssFactoryMetadata(value);
		if (
			metadata === undefined ||
			(kind !== undefined && metadata.kind !== kind) ||
			!hasCssExtractorPreset(metadata)
		)
			return [];
		return [metadata];
	});
	const unique = [...new Set(candidates)];
	const changed = unique.filter((metadata) => metadata.preset !== currentPreset);
	if (changed.length > 1) {
		throw new Error(
			`yumcssExtractVite: ${compositionModule} exposes multiple changed CSS compositions; ` +
				"split them across separate extractor instances",
		);
	}
	return changed[0] ?? unique[0];
};

/**
 * Create the css() static extractor from the composed CSS function used by
 * the application. A raw preset remains accepted for low-level integrations;
 * application code should pass `createCss(preset)` or `createDesignCss(preset)`.
 */
export function yumcssExtractVite(input: CssViteInput, options: YumCSSExtractViteOptions = {}) {
	const root = options.root ?? process.cwd();
	const metadata = readCssFactoryMetadata(input);
	const inputPreset = metadata?.preset ?? input;
	if (!isCssExtractorPreset(inputPreset)) {
		throw new Error(
			"yumcssExtractVite: pass a CSS composition from createCss/createDesignCss " +
				"or a complete CSS preset",
		);
	}
	let activePreset = inputPreset;
	let activeMetadata = metadata;
	const initialOptions = { ...factoryOptions(metadata), ...options };
	let libraryArtifacts: readonly YumCSSLibArtifact[] = [];
	let core = createCssExtractorPluginCore(activePreset, initialOptions, libraryArtifacts);
	let resolvedConfig: { command?: "build" | "serve" } | undefined;
	let isSsrBuild = false;
	const compositionModules = new Map<string, ReadonlySet<CssFactoryKind>>();
	const compositionConsumers = new Map<string, Set<string>>();
	const consumerCompositions = new Map<string, Set<string>>();
	const stylesheetPrefix = `\0${options.virtualId ?? "yumcss:css"}.css`;
	const cssExtractorInstanceId = nextCssExtractorInstanceId++;
	const buildCssMarkers = new Map<
		string,
		{ readonly selector: string; readonly property: string; readonly value: number }
	>();
	const builtSourceFiles = new Set<string>();
	let hasBuiltSourceGraph = false;
	let nextCssMarker = 0;

	const forgetCompositionConsumer = (consumer: string): void => {
		const compositions = consumerCompositions.get(consumer);
		if (compositions === undefined) return;
		for (const composition of compositions) {
			const consumers = compositionConsumers.get(composition);
			if (consumers === undefined) continue;
			consumers.delete(consumer);
			if (consumers.size === 0) {
				compositionConsumers.delete(composition);
				if ((compositionModules.get(composition)?.size ?? 0) === 0)
					compositionModules.delete(composition);
			}
		}
		consumerCompositions.delete(consumer);
	};

	const rememberCompositionConsumer = (composition: string, consumer: string): void => {
		const consumers = compositionConsumers.get(composition) ?? new Set<string>();
		consumers.add(consumer);
		compositionConsumers.set(composition, consumers);
		const compositions = consumerCompositions.get(consumer) ?? new Set<string>();
		compositions.add(composition);
		consumerCompositions.set(consumer, compositions);
		if (!compositionModules.has(composition)) compositionModules.set(composition, new Set());
	};

	const registerCompositionConsumers = async (
		pluginContext: Pick<PluginContext, "resolve">,
		code: string,
		id: string,
	): Promise<void> => {
		const normalizedId = normalizeFilePath(id);
		forgetCompositionConsumer(normalizedId);
		const sources = findCssCarrierImportSources(code, id, options.cssSources ?? ["css", "design"]);
		const resolved = await Promise.all(
			sources.map(async (source) => {
				try {
					return await pluginContext.resolve(source, id, { skipSelf: true });
				} catch {
					return null;
				}
			}),
		);
		for (const module of resolved) {
			if (module === null) continue;
			rememberCompositionConsumer(normalizeFilePath(module.id), normalizedId);
		}
	};

	const reloadComposition = async (server: ViteDevServer, changedFile: string): Promise<void> => {
		const affected = [...compositionModules.entries()].filter(([compositionModule]) =>
			compositionModuleIsAffected(changedFile, compositionModule, server),
		);
		if (affected.length === 0) return;
		const candidates: CssFactoryWithPreset[] = [];
		for (const [compositionModule] of affected) {
			const next = await loadCssFactory({
				server,
				compositionModule,
				kind: activeMetadata?.kind,
				root,
				currentPreset: activePreset,
			});
			if (next !== undefined) candidates.push(next);
		}
		const unique = [...new Set(candidates)];
		if (unique.length > 1) {
			throw new Error(
				"yumcssExtractVite: multiple CSS compositions changed in one extractor; " +
					"split them across separate extractor instances",
			);
		}
		const nextMetadata = unique[0];
		if (nextMetadata === undefined) return;
		const nextOptions = { ...factoryOptions(nextMetadata), ...options };
		if (options.engine !== undefined && nextMetadata.preset !== options.engine.preset) {
			const refreshed = refreshYumCSSEngineContext(options.engine, {
				preset: nextMetadata.preset,
				className: options.engine.className,
				...(nextOptions.debug === undefined ? {} : { debug: nextOptions.debug }),
			});
			if (!refreshed) {
				throw new Error("yumcssExtractVite: the shared engine cannot refresh its preset during HMR");
			}
		}
		activePreset = nextMetadata.preset;
		activeMetadata = nextMetadata;
		core = createCssExtractorPluginCore(activePreset, nextOptions, libraryArtifacts);
		if (resolvedConfig !== undefined) core.configResolved(resolvedConfig);
	};

	return {
		name: "yumcss:extract-css",
		enforce: "pre" as const,
		async buildStart(this: Pick<PluginContext, "resolve">) {
			if (resolvedConfig?.command === "build") {
				buildCssMarkers.clear();
				builtSourceFiles.clear();
				hasBuiltSourceGraph = false;
				nextCssMarker = 0;
			}
			if (options.libraries === undefined || options.libraries.length === 0) return;
			const effectiveOptions = { ...factoryOptions(activeMetadata), ...options };
			libraryArtifacts = await loadLibraryArtifacts({
				libraries: options.libraries,
				root,
				preset: activePreset,
				options: effectiveOptions,
				resolver: this,
			});
			core = createCssExtractorPluginCore(activePreset, effectiveOptions, libraryArtifacts);
			if (resolvedConfig !== undefined) core.configResolved(resolvedConfig);
		},
		transform(this: Pick<PluginContext, "resolve"> | null | undefined, code: string, id: string) {
			if (id.includes("node_modules")) return core.transform(code, id);
			const kinds = findCssFactoryKinds(code, id);
			const normalizedId = normalizeFilePath(id);
			if (kinds.size === 0) compositionModules.delete(normalizedId);
			else compositionModules.set(normalizedId, kinds);
			if (typeof this?.resolve === "function" && !id.includes("node_modules")) {
				return registerCompositionConsumers(this, code, id).then(() => core.transform(code, id));
			}
			return core.transform(code, id);
		},
		configResolved(config: ResolvedConfig) {
			resolvedConfig = config;
			isSsrBuild = Boolean(config.build.ssr);
			core.configResolved(config);
		},
		closeBundle() {
			if (!isSsrBuild)
				core.closeBundle(hasBuiltSourceGraph ? [...builtSourceFiles].toSorted() : undefined);
		},
		resolveId(source: string) {
			return core.resolveId(source);
		},
		load(id: string) {
			if (resolvedConfig?.command === "build" && !isSsrBuild && id.startsWith(stylesheetPrefix)) {
				let marker = buildCssMarkers.get(id);
				if (marker === undefined) {
					const value = nextCssMarker++;
					const selector = `.yumcss-css-anchor-${cssExtractorInstanceId}-${value}`;
					const property = `--yumcss-css-anchor-${cssExtractorInstanceId}-${value}`;
					marker = { selector, property, value };
					buildCssMarkers.set(id, marker);
				}
				return `${marker.selector}{${marker.property}:${marker.value}}`;
			}
			return core.load(id);
		},
		generateBundle: {
			order: "post" as const,
			handler(this: PluginContext, _outputOptions: unknown, bundle: OutputBundle) {
				if (
					resolvedConfig?.command !== "build" ||
					isSsrBuild ||
					(buildCssMarkers.size === 0 && options.inlineCritical === undefined)
				)
					return;
				const sourceFiles = new Set<string>();
				for (const output of Object.values(bundle)) {
					if (output.type !== "chunk") continue;
					for (const moduleId of output.moduleIds) {
						if (moduleId.startsWith("\0")) continue;
						const file = withoutQuery(moduleId);
						if (!isAbsolute(file)) continue;
						sourceFiles.add(resolve(file));
					}
				}
				const sortedSourceFiles = [...sourceFiles].toSorted();
				for (const file of sortedSourceFiles) builtSourceFiles.add(file);
				hasBuiltSourceGraph = true;

				if (buildCssMarkers.size === 0) return;
				for (const [id, marker] of buildCssMarkers) {
					const escapedSelector = marker.selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
					const escapedProperty = marker.property.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
					const markerRule = new RegExp(
						`${escapedSelector}\\s*\\{\\s*${escapedProperty}\\s*:\\s*${marker.value}\\s*;?\\s*\\}`,
						"u",
					);
					const css = core.loadForFiles(id, sortedSourceFiles) ?? "";
					let replaced = false;
					for (const output of Object.values(bundle)) {
						if (output.type !== "asset" || typeof output.source !== "string") continue;
						if (!markerRule.test(output.source)) continue;
						output.source = output.source.replace(markerRule, css);
						replaced = true;
					}
					if (!replaced) {
						const assets = Object.values(bundle).flatMap((output) => {
							if (output.type !== "asset") return [];
							const source =
								typeof output.source === "string"
									? output.source
									: new TextDecoder().decode(output.source);
							if (!output.fileName.endsWith(".css") && !markerRule.test(source)) return [];
							return [`${output.fileName}: anchor=${markerRule.test(source)}`];
						});
						this.error(
							`YumCSS stylesheet anchor was not emitted for ${id}; ` +
								`expected ${marker.selector}; assets: ${assets.slice(0, 8).join(", ") || "(none)"}`,
						);
					}
				}
			},
		},
		async handleHotUpdate(ctx: CssHmrContext): Promise<ModuleNode[] | undefined> {
			const server = ctx.server;
			let compositionDependants: ModuleNode[] = [];
			let compositionChanged = false;
			if (server !== undefined) {
				const changedFile = normalizeFilePath(ctx.file);
				await ensureCompositionModuleGraph({
					server,
					compositionModules: [...compositionModules.keys()],
					root,
				});
				const affectedCompositionModules = [...compositionModules.keys()].filter(
					(compositionModule) =>
						compositionModuleIsAffected(changedFile, compositionModule, server),
				);
				if (affectedCompositionModules.length > 0) {
					compositionChanged = true;
					const consumers: string[] = [];
					for (const compositionModule of affectedCompositionModules) {
						for (const consumer of compositionConsumers.get(compositionModule) ?? [])
							consumers.push(consumer);
					}
					compositionDependants = compositionModulesToUpdate(server, consumers);
					server.moduleGraph.onFileChange(changedFile);
					await reloadComposition(server, changedFile);
				}
			}
			core.invalidate(ctx.file);
			const virtual = server?.moduleGraph.getModuleById(
				`\0${options.virtualId ?? "yumcss:css"}.css`,
			);
			const modules = [
				...new Set(compositionChanged ? compositionDependants : (ctx.modules ?? [])),
			];
			if (virtual !== undefined && !modules.includes(virtual)) modules.push(virtual);
			if (modules.length === 0) return ctx.modules;
			return modules;
		},
		/** Programmatic invalidation (tests, custom HMR wiring). */
		invalidate(file: string) {
			core.invalidate(file);
		},
	};
}
