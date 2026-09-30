import { toOxcNode } from "../oxc-node.ts";
import { NodeKind, VariableDeclarationKindTag } from "../ast-node-kind.ts";
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
 * can still be covered by the `pandwind-codemod tw scan` safelist.
 */
import { basename, dirname, resolve } from "node:path";
import { SOURCE_SCANNER_SERVICE } from "../source-scanner.ts";
import { createSourceWorkspace } from "../source-workspace.ts";
import { walk, walkWithParent } from "../tw/literal.ts";
import { findCxImports, inlineCxCalls } from "./cx-inline.ts";
import {
	bindingIsShadowedOrWritten,
	createCrossModuleConstResolver,
} from "./cross-module-consts.ts";
import { type OxcNode } from "../tw/literal.ts";
import { createCssSourceService } from "./css-source-service.ts";
import { createPandwindEngineContext, type PandwindEngineContext } from "./engine-context.ts";
import type { ClassNameStrategy } from "../css/class-name-strategy.ts";
import type { CssPreset } from "./css-extract.ts";
import {
	extractTwConfigFromSources,
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
	 * Tailwind scanner (`@source inline` or the `pandwind-codemod tw scan`
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
			program: { type: NodeKind.Program, body: [] } as OxcNode,
		};
	const result = SOURCE_SCANNER_SERVICE.parse({ file: id, source: code });
	const program = toOxcNode(result.program);
	const info = { localNames: new Set<string>(), sources: [] as string[] };

	walk(program, (node) => {
		if (node.type !== NodeKind.ImportDeclaration) return;
		const source = (node as { source?: { value?: string } }).source?.value;
		if (typeof source !== "string" || !isTwSource(source)) return;
		for (const specifier of (node as { specifiers?: OxcSpecifier[] }).specifiers ?? []) {
			if (specifier.type !== NodeKind.ImportSpecifier) continue;
			const imported = (specifier as { imported?: { name?: string } }).imported?.name;
			const local = (specifier as { local?: { name?: string } }).local?.name;
			if (imported === "tw" && typeof local === "string") {
				info.localNames.add(local);
				info.sources.push(source);
			}
		}
	});
	return { ...info, program };
}

const findLocalTwFactory = (
	code: string,
	program: OxcNode,
): { readonly name: string; readonly config: TwConfig } | undefined => {
	const createTwNames = new Set<string>();
	for (const statement of (program as { body?: OxcNode[] }).body ?? []) {
		if (statement.type !== NodeKind.ImportDeclaration) continue;
		const importStatement = statement as { source?: { value?: string }; importKind?: string };
		if (importStatement.source?.value !== "pandwind/tw" || importStatement.importKind === "type")
			continue;
		for (const specifier of (statement as { specifiers?: OxcSpecifier[] }).specifiers ?? []) {
			if (specifier.type !== NodeKind.ImportSpecifier) continue;
			const entry = specifier as {
				imported?: { name?: string };
				local?: { name?: string };
				importKind?: string;
			};
			if (entry.importKind === "type" || entry.imported?.name !== "createTw") continue;
			if (typeof entry.local?.name === "string") createTwNames.add(entry.local.name);
		}
	}
	if (createTwNames.size === 0) return undefined;

	const createTwCalls: string[] = [];
	walk(program, (node) => {
		if (node.type !== NodeKind.CallExpression) return;
		const callee = (node as { callee?: OxcNode | null }).callee;
		if (callee?.type !== NodeKind.Identifier) return;
		const name = (callee as { name?: string }).name;
		if (name !== undefined && createTwNames.has(name)) createTwCalls.push(name);
	});
	if (createTwCalls.length !== 1) return undefined;
	const createTwName = createTwCalls[0];
	if (createTwName === undefined || bindingIsShadowedOrWritten(program, createTwName))
		return undefined;

	const factories: Array<{ readonly name: string; readonly binding: OxcNode }> = [];
	for (const statement of (program as { body?: OxcNode[] }).body ?? []) {
		if (
			statement.type !== NodeKind.VariableDeclaration ||
			(statement as { kind?: string }).kind !== VariableDeclarationKindTag.Const
		)
			continue;
		for (const declarator of (
			statement as { declarations?: Array<{ id?: OxcNode; init?: OxcNode | null }> }
		).declarations ?? []) {
			const binding = declarator.id;
			const initializer = declarator.init;
			if (binding?.type !== NodeKind.Identifier || initializer?.type !== NodeKind.CallExpression)
				continue;
			const callee = (initializer as { callee?: OxcNode | null }).callee;
			if (
				callee?.type !== NodeKind.Identifier ||
				(callee as { name?: string }).name !== createTwName
			)
				continue;
			const name = (binding as { name?: string }).name;
			if (name !== undefined) factories.push({ name, binding });
		}
	}
	if (factories.length !== 1) return undefined;
	const factory = factories[0];
	if (factory === undefined) return undefined;

	let callSites = 0;
	let isSafeBinding = true;
	walkWithParent(program, (node, parent) => {
		if (node.type !== NodeKind.Identifier || (node as { name?: string }).name !== factory.name)
			return;
		if (node === factory.binding) return;
		if (
			parent?.type === NodeKind.CallExpression &&
			(parent as { callee?: OxcNode }).callee === node
		) {
			callSites++;
			return;
		}
		isSafeBinding = false;
	});
	if (!isSafeBinding || callSites === 0) return undefined;
	const config = extractTwConfigFromSources([code]);
	return config === undefined ? undefined : { name: factory.name, config };
};

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
	const transformCache = new Map<
		string,
		{ code: string; result: { code: string; map: null } | null }
	>();
	const transformCacheLimit = 2048;
	const cachedTransform = (
		id: string,
		code: string,
	): { code: string; map: null } | null | undefined => {
		const cached = transformCache.get(id);
		if (cached === undefined) return undefined;
		if (cached.code !== code) {
			transformCache.delete(id);
			return undefined;
		}
		transformCache.delete(id);
		transformCache.set(id, cached);
		return cached.result;
	};
	const remember = (id: string, code: string, result: { code: string; map: null } | null): void => {
		transformCache.delete(id);
		transformCache.set(id, { code, result });
		if (transformCache.size <= transformCacheLimit) return;
		const oldest = transformCache.keys().next().value;
		if (oldest !== undefined) transformCache.delete(oldest);
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
	const runtimePruner = createRuntimePruningTransform({ preset: cssFold?.engine.preset });

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
		const generatedSources = sourceWorkspace
			.read([
				resolved.id,
				resolve(dirname(resolved.id), "tw.runtime.ts"),
				resolve(dirname(resolved.id), "tw.conflicts.ts"),
				resolve(dirname(resolved.id), "tw.build.ts"),
			])
			.map(({ source }) => source);
		if (generatedSources.length === 0) return undefined;
		const config = extractTwConfigFromSources(generatedSources);
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
			const cached = cachedTransform(id, code);
			if (cached !== undefined) return cached;
			if (!/\b(tw|cx)\b/.test(code)) {
				const result = runtimePruner.transform(code, id);
				remember(id, code, result);
				return result;
			}

			const imports = findTwImports(code, id, isTwSource);
			const cxImports = findCxImports(code, id, isCxSource, imports.program);
			const localTw =
				imports.localNames.size === 0 && imports.sources.length === 0
					? findLocalTwFactory(code, imports.program)
					: undefined;
			const twNames = localTw === undefined ? imports.localNames : new Set([localTw.name]);
			if (twNames.size === 0 && imports.sources.length === 0) {
				// CSS atoms carry their own property metadata through the fold
				// engine, so a CSS-only cx() call does not need generated tw
				// conflict metadata. Keep the ordinary no-metadata guard for
				// plain class strings, but let the existing cx compiler handle
				// css()/css.class() when the CSS lane is configured.
				if (cssFold === undefined || cxImports.localNames.size === 0) {
					const result = runtimePruner.transform(code, id);
					remember(id, code, result);
					return result;
				}
				const cssNames = cssSourceService.findCssImports(code, id, cssFold.cssSources);
				if (cssNames.size === 0) {
					const result = runtimePruner.transform(code, id);
					remember(id, code, result);
					return result;
				}
				const cssOnly = inlineCxCalls(code, id, { variants: {} }, cxImports.localNames, {
					fold: { cssNames, engine: cssFold.engine },
					parsedProgram: cxImports.program,
					onUnresolved: OnUnresolvedTag.Off,
				});
				const optimized = runtimePruner.transform(cssOnly.code, id);
				const result =
					cssOnly.inlined === 0 && optimized === null
						? null
						: { code: optimized?.code ?? cssOnly.code, map: null };
				remember(id, code, result);
				return result;
			}
			let config = localTw?.config;
			if (config === undefined) {
				if (resolver === undefined) return null;
				// Sequential short-circuit: stop at the first source that resolves
				// to a generated tw module. Promise.all would load them needlessly.
				for (const source of imports.sources) {
					config = await loadConfig(resolver, id, source);
					if (config !== undefined) break;
				}
			}
			if (config === undefined) return null;

			let working = code;
			// Cross-module constant propagation: resolve this module's import
			// bindings against the per-build exported-const registry (HMR-aware).
			const importedConstants = crossModuleResolver.importedScope(id, imports.program);
			const result = inlineTwCalls(working, id, config, twNames, importedConstants, {
				...unresolvedOptions,
				parsedProgram: imports.program,
			});
			working = result.code;
			if (result.candidates?.length) reportCandidates(result.candidates);

			// cx pass runs on the post-tw code: folded tw() strings then
			// participate as plain string arguments to cx(). With css folding
			// configured, literal css()/css.class() atoms compile through the
			// shared engine context and merge via its registry.
			const cxImportsAfterTw = findCxImports(
				working,
				id,
				isCxSource,
				result.inlined === 0 ? imports.program : undefined,
			);
			let inlined = result.inlined;
			let cxUnresolved: UnresolvedToken[] = [];
			if (cxImportsAfterTw.localNames.size > 0) {
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
					parsedProgram: cxImportsAfterTw.program,
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
			remember(id, code, transformed);
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
	PANDWIND_LIB_COMPILER,
	PANDWIND_LIB_GENERATOR,
	PANDWIND_LIB_SCHEMA,
	checkPandwindLibCompatibility,
	createPandwindLibArtifact,
	createPandwindLibCompatibility,
	hashPandwindLibSource,
	validatePandwindLibArtifact,
	type PandwindLibArtifact,
	type PandwindLibArtifactInput,
	type PandwindLibCompatibility,
	type PandwindLibCompatibilityCheck,
	type PandwindLibCompatibilityOptions,
	type PandwindLibRule,
	type PandwindLibSource,
	type PandwindLibValidation,
} from "./lib-artifact.ts";
export {
	createPandwindEngineContext,
	type PandwindEngineContext,
	type PandwindEngineContextOptions,
} from "./engine-context.ts";
export { foldStackElements, stackFoldVite, type StackFoldOptions } from "./stack-fold.ts";
