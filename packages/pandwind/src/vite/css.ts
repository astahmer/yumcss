/**
 * pandwind css() static extractor — generates the atomic stylesheet at build
 * time from literal `css(...)` calls, instead of accumulating it at runtime.
 *
 * ```ts
 * // vite.config.ts
 * import { pandwindCssVite } from "pandwind/vite";
 * import { css } from "./src/css";
 *
 * export default defineConfig({
 *   plugins: [pandwindCssVite(css)],
 * });
 * ```
 *
 * ```ts
 * // main.tsx — the generated CSS is served as a virtual module
 * import "pandwind:css";
 * ```
 *
 * Source files are scanned directly (like Tailwind's own scanner, and like
 * `pandwind-codemod tw scan` for the safelist) rather than collected from transforms — module
 * load order varies between dev and build, and the virtual stylesheet must be
 * complete no matter when it is requested. Every `css({ ... })` call with a
 * literal object is resolved through the design layer and its atomic rule is
 * added to a shared stylesheet; the virtual module serves the deduped CSS
 * (tokens + rules), and the transform replaces the call with its final carrier.
 * The runtime hashes the same calls deterministically, so runtime class names
 * always match. Calls with dynamic arguments are skipped and keep the runtime
 * fallback by default; `transformDynamicClassName` is the opt-in host rewrite
 * for simple mixed `css.class()` JSX bindings.
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
import { realpathSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { HmrContext, ModuleNode, ViteDevServer } from "vite";
import { createCssExtractorPluginCore } from "./css-core.ts";
import { refreshPandwindEngineContext, type PandwindEngineContext } from "./engine-context.ts";
import { findCssFactoryKinds } from "./css-factory-source.ts";
import { readCssFactoryMetadata } from "./css-factory-metadata.ts";
import { type CssFactoryKind, type CssFactoryMetadata } from "../css/factory-metadata.ts";
import type { CssFn } from "../css/create-css.ts";
import type { ClassNameStrategy } from "../css/class-name-strategy.ts";
import type { CssCascadeMode } from "../css/cascade.ts";

export interface PandwindCssViteOptions {
	/** Match host stylesheet precedence with StyleX specificity or a native layer. */
	cascade?: CssCascadeMode;
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
	/**
	 * Namespace for Pandwind-owned dynamic-value carriers and critical markers.
	 * Keep this equal to the namespace passed to the CSS factory in app code.
	 */
	namespace?: string;
	/**
	 * Optional authored property aliases. Keep this equal to the map passed to
	 * the CSS factory so folded calls and generated declarations agree.
	 */
	propertyAliases?: Readonly<Record<string, string>>;
	/**
	 * Opt-in JSX rewrite for mixed `className={css.class({ ... })}` calls.
	 * Scalar dynamic declarations move to `css.vars()` and literal
	 * declarations stay in `css.class()`, with the host changed to a
	 * `css.props()` spread. Unsupported host shapes stay untouched.
	 */
	transformDynamicClassName?: boolean;
	/** Directory scanned for css() calls. Defaults to process.cwd(). */
	root?: string;
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
	 * The virtual `pandwind:css` module serves empty CSS in this mode.
	 *
	 * Sheet-backed strategies (e.g. `createNamedAtomsStrategy`) also swap
	 * the emitted class names, but their classes are compiled by this
	 * plugin's own generated stylesheet — the virtual module serves it.
	 */
	className?: ClassNameStrategy;
	/**
	 * Shared engine context (createPandwindEngineContext). When supplied it
	 * must carry the same preset, and its class-name strategy wins over
	 * `className` — pass the SAME context to `pandwindVite({ css })` to wire
	 * both plugins to one configuration source.
	 */
	engine?: PandwindEngineContext;
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

const compositionModuleIsAffected = (
	file: string,
	compositionModule: string,
	server: ViteDevServer,
): boolean => {
	const changedFile = normalizeFilePath(file);
	if (changedFile === compositionModule) return true;

	const rootModule = server.moduleGraph.getModuleById(compositionModule);
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

const toViteModuleUrl = (file: string, root: string): string => {
	const relativePath = relative(root, file).replaceAll("\\", "/");
	if (relativePath !== "" && !relativePath.startsWith("../")) return `/${relativePath}`;
	return `/@fs/${file.replaceAll("\\", "/")}`;
};

const factoryOptions = (metadata: CssFactoryMetadata | undefined): PandwindCssViteOptions => {
	if (metadata === undefined) return {};
	return metadata.options;
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
			`pandwindCssVite: ${compositionModule} exposes multiple changed CSS compositions; ` +
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
export function pandwindCssVite(input: CssViteInput, options: PandwindCssViteOptions = {}) {
	const root = options.root ?? process.cwd();
	const metadata = readCssFactoryMetadata(input);
	const inputPreset = metadata?.preset ?? input;
	if (!isCssExtractorPreset(inputPreset)) {
		throw new Error(
			"pandwindCssVite: pass a CSS composition from createCss/createDesignCss " +
				"or a complete CSS preset",
		);
	}
	let activePreset = inputPreset;
	let activeMetadata = metadata;
	const initialOptions = { ...factoryOptions(metadata), ...options };
	let core = createCssExtractorPluginCore(activePreset, initialOptions);
	let resolvedConfig: { command?: "build" | "serve" } | undefined;
	const compositionModules = new Map<string, ReadonlySet<CssFactoryKind>>();

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
				"pandwindCssVite: multiple CSS compositions changed in one extractor; " +
					"split them across separate extractor instances",
			);
		}
		const nextMetadata = unique[0];
		if (nextMetadata === undefined) return;
		const nextOptions = { ...factoryOptions(nextMetadata), ...options };
		if (options.engine !== undefined && nextMetadata.preset !== options.engine.preset) {
			const refreshed = refreshPandwindEngineContext(options.engine, {
				preset: nextMetadata.preset,
				className: options.engine.className,
				...(nextOptions.debug === undefined ? {} : { debug: nextOptions.debug }),
				...(nextOptions.propertyAliases === undefined
					? {}
					: { propertyAliases: nextOptions.propertyAliases }),
			});
			if (!refreshed) {
				throw new Error("pandwindCssVite: the shared engine cannot refresh its preset during HMR");
			}
		}
		activePreset = nextMetadata.preset;
		activeMetadata = nextMetadata;
		core = createCssExtractorPluginCore(activePreset, nextOptions);
		if (resolvedConfig !== undefined) core.configResolved(resolvedConfig);
	};

	return {
		name: "pandwind:extract-css",
		enforce: "pre" as const,
		transform(code: string, id: string) {
			const kinds = findCssFactoryKinds(code, id);
			const normalizedId = normalizeFilePath(id);
			if (kinds.size === 0) compositionModules.delete(normalizedId);
			else compositionModules.set(normalizedId, kinds);
			return core.transform(code, id);
		},
		configResolved(config: { command?: "build" | "serve" }) {
			resolvedConfig = config;
			core.configResolved(config);
		},
		closeBundle() {
			core.closeBundle();
		},
		resolveId(source: string) {
			return core.resolveId(source);
		},
		load(id: string) {
			return core.load(id);
		},
		async handleHotUpdate(ctx: CssHmrContext): Promise<ModuleNode[] | undefined> {
			const server = ctx.server;
			if (server !== undefined) {
				const changedFile = normalizeFilePath(ctx.file);
				const compositionChanged = [...compositionModules.keys()].some((compositionModule) =>
					compositionModuleIsAffected(changedFile, compositionModule, server),
				);
				if (compositionChanged) {
					server.moduleGraph.onFileChange(changedFile);
					await reloadComposition(server, changedFile);
				}
			}
			core.invalidate(ctx.file);
			const virtual = server?.moduleGraph.getModuleById(
				`\0${options.virtualId ?? "pandwind:css"}.css`,
			);
			const modules = ctx.modules ?? [];
			if (virtual === undefined || modules.includes(virtual)) return ctx.modules;
			return [...modules, virtual];
		},
		/** Programmatic invalidation (tests, custom HMR wiring). */
		invalidate(file: string) {
			core.invalidate(file);
		},
	};
}
