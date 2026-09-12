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
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { HmrContext, ModuleNode, ViteDevServer } from "vite";
import { createCssExtractorPluginCore } from "./css-core.ts";
import type { PandwindEngineContext } from "./engine-context.ts";
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
	 * Source module that exports the preset, as an absolute path or file URL.
	 * Vite evaluates its config once, so a preset imported directly by the
	 * config otherwise stays stale during dev-server HMR. When this is set,
	 * edits to the module or its imports reload the preset and rebuild the
	 * extractor before the virtual stylesheet is served.
	 */
	presetModule?: string;
	/** Named export to reload from `presetModule`. Defaults to `default`. */
	presetExport?: string;
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

type CssHmrContext = Pick<HmrContext, "file"> &
	Partial<Pick<HmrContext, "modules" | "server">>;

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

const withoutQuery = (value: string): string => value.split(/[?#]/u, 1)[0]!;

const normalizeFilePath = (value: string): string => resolve(withoutQuery(value));

const moduleContainsFile = (module: ModuleNode, file: string): boolean =>
	module.file !== null && normalizeFilePath(module.file) === file;

const presetModuleIsAffected = (
	file: string,
	presetModule: string,
	server: ViteDevServer,
): boolean => {
	const changedFile = normalizeFilePath(file);
	if (changedFile === presetModule) return true;

	const rootModule = server.moduleGraph.getModuleById(presetModule);
	if (rootModule === undefined) return false;

	const pending = [...rootModule.importedModules];
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

const resolvePresetModule = (module: string, root: string): string =>
	module.startsWith("file://") ? fileURLToPath(module) : resolve(root, module);

const loadPreset = async ({
	server,
	presetModule,
	presetExport,
}: {
	server: ViteDevServer;
	presetModule: string;
	presetExport: string;
}): Promise<CssExtractorPreset> => {
	const namespace = await server.ssrLoadModule(presetModule, { fixStacktrace: true });
	const candidate: unknown = namespace[presetExport];
	if (!isCssExtractorPreset(candidate)) {
		throw new Error(
			`pandwindCssVite: ${presetModule} must export a CSS preset as '${presetExport}'`,
		);
	}
	return candidate;
};

/**
 * Create the css() static extractor. The preset must be the same object
 * passed to `createDesignCss` in app code — it drives both resolution and
 * token output, so the generated CSS matches the runtime byte-for-byte.
 */
export function pandwindCssVite(preset: CssExtractorPreset, options: PandwindCssViteOptions = {}) {
	const root = options.root ?? process.cwd();
	const presetModule =
		options.presetModule === undefined
			? undefined
			: resolvePresetModule(options.presetModule, root);
	const presetExport = options.presetExport ?? "default";
	let core = createCssExtractorPluginCore(preset, options);
	let resolvedConfig: { command?: "build" | "serve" } | undefined;

	const reloadPreset = async (server: ViteDevServer): Promise<void> => {
		if (presetModule === undefined) return;
		const nextPreset = await loadPreset({ server, presetModule, presetExport });
		if (options.engine !== undefined && nextPreset !== options.engine.preset) {
			throw new Error(
				"pandwindCssVite: presetModule HMR cannot reload a preset shared through " +
					"options.engine; reload the shared engine and extractor together",
			);
		}
		core = createCssExtractorPluginCore(nextPreset, options);
		if (resolvedConfig !== undefined) core.configResolved(resolvedConfig);
	};

	return {
		name: "pandwind:extract-css",
		enforce: "pre" as const,
		transform(code: string, id: string) {
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
			if (
				presetModule !== undefined &&
				ctx.server !== undefined &&
				presetModuleIsAffected(ctx.file, presetModule, ctx.server)
			) {
				await reloadPreset(ctx.server);
			}
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
