/**
 * Bundler-agnostic core of the css() static extractor: transform (external,
 * sheet-backed, and default atomic modes), virtual-module `resolveId`/`load`, and cache
 * invalidation. Shared by `pandwindCssVite` and the unplugin adapters.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createStylesheet } from "../css/create-stylesheet.ts";
import type { ClassNameStrategy } from "../css/class-name-strategy.ts";
import { decorateCascadeRules, wrapCascadeLayer } from "../css/cascade.ts";
import { createStylesheetOrderingPolicy } from "../css/stylesheet-policies.ts";
import { renderCriticalHtml } from "./critical-css.ts";
import type { CssExtractorPreset, PandwindCssViteOptions } from "./css.ts";
import {
	checkPandwindLibCompatibility,
	type PandwindLibArtifact,
	type PandwindLibRule,
} from "./lib-artifact.ts";
import { StaticCssCallRewriter } from "./css-call-rewriter.ts";
import { createCssSourceService } from "./css-source-service.ts";
import { createCssSourceWorkspace } from "./css-source-workspace.ts";
import { createRuntimePruningTransform } from "./runtime-pruner.ts";
import { createSourceWorkspace } from "../source-workspace.ts";
import { SOURCE_SCANNER_SERVICE } from "../source-scanner.ts";

export type { CssExtractorPreset };

export interface CssExtractorCore {
	/** Vite hook: capture the command so closeBundle only runs on builds. */
	configResolved(config: { command?: "build" | "serve" }): void;
	/** Build-only: inline route critical chunks into configured HTML entries. */
	closeBundle(sourceFiles?: Array<string>): void;
	name: string;
	/** Rewrite statically representable css() calls before bundling. */
	transform(code: string, id: string): { code: string; map: null } | null;
	resolveId(source: string): string | null;
	load(id: string): string | null;
	/** Render a virtual stylesheet from the host bundler's reachable source files. */
	loadForFiles(id: string, sourceFiles: Array<string>): string | null;
	invalidate(file: string): void;
}

/** Join sheet sections into one CSS document, dropping empties. */
const render = (
	atomic: readonly PandwindLibRule[],
	vars: readonly PandwindLibRule[],
	tokens: string,
	web: string,
	keyframes: string,
	cascade: PandwindCssViteOptions["cascade"],
	priorityUniverse: readonly PandwindLibRule[] = [...atomic, ...vars],
): string => {
	const ordering = createStylesheetOrderingPolicy();
	const orderedAtomic = ordering.order(atomic);
	const orderedVars = ordering.order(vars);
	const decorated = decorateCascadeRules(
		[...orderedAtomic, ...orderedVars],
		cascade,
		priorityUniverse,
	);
	const body = [
		tokens,
		web,
		keyframes,
		decorated
			.slice(0, orderedAtomic.length)
			.map((entry) => entry.css)
			.join("\n"),
		decorated
			.slice(orderedAtomic.length)
			.map((entry) => entry.css)
			.join("\n"),
	]
		.filter(Boolean)
		.join("\n");
	return wrapCascadeLayer(body, cascade);
};

const mergeEntries = <TEntry extends { readonly id: string }>(
	local: readonly TEntry[],
	external: readonly TEntry[],
): TEntry[] => {
	const entries = new Map(local.map((entry) => [entry.id, entry] as const));
	for (const entry of external) if (!entries.has(entry.id)) entries.set(entry.id, entry);
	return [...entries.values()];
};

const mergeTokenEntries = (
	local: readonly { readonly declaration: string; readonly priority: number }[],
	external: readonly { readonly declaration: string; readonly priority: number }[],
): Array<{ declaration: string; priority: number }> => {
	const entries = new Map(local.map((entry) => [entry.declaration, entry] as const));
	for (const entry of external)
		if (!entries.has(entry.declaration)) entries.set(entry.declaration, entry);
	return [...entries.values()];
};

const mergeCssSections = (...sections: readonly string[]): string =>
	[...new Set(sections.filter((section) => section.length > 0))].join("\n");

const addImportAfterDirectives = (source: string, statement: string, id: string): string => {
	if (SOURCE_SCANNER_SERVICE.languageForFile(id) === "astro") {
		const opening = /^---[ \t]*\r?\n/u.exec(source);
		if (opening === null) return source;
		const bodyStart = opening[0].length;
		const closing = /\r?\n---[ \t]*(?:\r?\n|$)/u.exec(source.slice(bodyStart));
		if (closing === null) return source;
		const bodyEnd = bodyStart + closing.index;
		return `${source.slice(0, bodyStart)}${addImportAfterDirectives(
			source.slice(bodyStart, bodyEnd),
			statement,
			"source.ts",
		)}${source.slice(bodyEnd)}`;
	}
	const scriptOpen = /<script\b[^>]*>/iu.exec(source);
	if (scriptOpen !== null) {
		const bodyStart = scriptOpen.index + scriptOpen[0].length;
		const close = /<\/script\s*>/iu.exec(source.slice(bodyStart));
		if (close !== null) {
			const bodyEnd = bodyStart + close.index;
			return `${source.slice(0, bodyStart)}${addImportAfterDirectives(
				source.slice(bodyStart, bodyEnd),
				statement,
				"source.ts",
			)}${source.slice(bodyEnd)}`;
		}
	}
	const lines = source.split("\n");
	let directiveEnd = -1;
	let insertAt = -1;
	let sawDirective = false;
	for (let index = 0; index < lines.length; index++) {
		const trimmed = lines[index]!.trim();
		if (trimmed === "" || trimmed.startsWith("//") || trimmed.startsWith("/*")) {
			if (sawDirective) insertAt = index + 1;
			continue;
		}
		if (/^(['"]).*\1\s*;?$/u.test(trimmed)) {
			sawDirective = true;
			directiveEnd = index;
			insertAt = index + 1;
			continue;
		}
		break;
	}
	if (directiveEnd === -1) return `${statement}\n${source}`;
	lines.splice(insertAt, 0, statement);
	return lines.join("\n");
};

export function createCssExtractorPluginCore(
	preset: CssExtractorPreset,
	options: PandwindCssViteOptions = {},
	externalArtifacts: readonly PandwindLibArtifact[] = [],
): CssExtractorCore {
	if (options.engine !== undefined && options.engine.preset !== preset) {
		throw new Error(
			"pandwindCssVite: options.engine carries a different preset than the one passed " +
				"directly — they must be identical for build-time and runtime output to match",
		);
	}
	const matchers = options.cssSources ?? ["css", "design"];
	const virtualId = options.virtualId ?? "pandwind:css";
	const className = options.engine?.className ?? options.className;
	const namespace = options.namespace ?? "pw";
	for (const artifact of externalArtifacts) {
		const compatibility = checkPandwindLibCompatibility(artifact, preset, {
			namespace,
			cascade: options.cascade,
			className,
		});
		if (!compatibility.compatible)
			throw new Error(
				[
					"pandwindCssVite: incompatible Pandwind lib artifact",
					...compatibility.differences.map((difference) => `- ${difference}`),
				].join("\n"),
			);
	}
	const externalAtomic = externalArtifacts.flatMap((artifact) => artifact.rules.atomic);
	const externalVars = externalArtifacts.flatMap((artifact) => artifact.rules.vars);
	const externalTokens = externalArtifacts.flatMap((artifact) => artifact.tokens);
	const externalWeb = mergeCssSections(...externalArtifacts.map((artifact) => artifact.web));
	const sourceService = createCssSourceService({
		rewriter: new StaticCssCallRewriter(preset, className, {
			transformDynamicClassName: options.transformDynamicClassName === true,
			namespace,
			tokenVariableNames: options.tokenVariableNames,
		}),
	});
	const runtimePruner = createRuntimePruningTransform({ preset });
	const strategy: ClassNameStrategy | undefined = className;
	// External-compiler modes (tailwind): the sheet stays empty. Sheet-backed
	// strategies still get the generated stylesheet — with their class names.
	// The `.css` suffix makes vite's CSS pipeline (and its dev injection)
	// treat the virtual module as stylesheet, not JavaScript.
	const resolvedVirtualId = `\0${virtualId}.css`;
	const root = options.root ?? process.cwd();
	const include = options.include ?? [/\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/];
	const exclude = options.exclude ?? [/node_modules/, /(^|\/)dist(\/|$)/, /\.git/];
	const sourceWorkspace = createSourceWorkspace();
	const workspace = createCssSourceWorkspace({
		root,
		include,
		exclude,
		matchers,
		preset,
		sourceService,
		sourceWorkspace,
	});
	type RenderCache<T> = { files: Array<string>; value: T };
	let bodyCache: RenderCache<string> | undefined;
	let splitCache: RenderCache<{ common: string; routes: Map<string, string> }> | undefined;
	const routes = options.splitByRoute ?? [];
	const COMMON_BUCKET = "__common__";
	const resolvedManifestId = `\0${virtualId}-manifest.js`;
	const routeChunkId = (name: string): string => `\0${virtualId}.css?route=${name}`;

	const isScanned = (file: string): boolean =>
		include.some((pattern) => pattern.test(file)) && !exclude.some((pattern) => pattern.test(file));

	/**
	 * Var keys the transform-time rewriter introduced through vars carriers.
	 * The workspace's extractFile scanner cannot see these (it scans the
	 * pre-transform source), so transform records them and the collect paths
	 * merge them into the sheet.
	 */
	const carriedVarKeys = new Map<string, readonly string[]>();

	const transform = (code: string, id: string): { code: string; map: null } | null => {
		// Webpack hosts can invoke a universal plugin for compiler-owned modules
		// without a resource path. Those modules are outside the source graph and
		// must pass through untouched rather than reaching the path filters below.
		if (typeof code !== "string" || typeof id !== "string") return null;
		if (id.includes("node_modules")) return null;
		if (!isScanned(id)) return null;
		const names = sourceService.findCssImports(code, id, matchers);
		let extracted = code;
		if (names.size === 0) carriedVarKeys.delete(id);
		else {
			const result = sourceService.inline(code, id, names, preset, className);
			extracted = result.code;
			if (result.varKeys.length > 0) carriedVarKeys.set(id, result.varKeys);
			else carriedVarKeys.delete(id);
		}
		const withStylesheetImport =
			names.size > 0 &&
			!extracted.includes(`"${virtualId}"`) &&
			!extracted.includes(`'${virtualId}'`)
				? addImportAfterDirectives(extracted, `import "${virtualId}";`, id)
				: extracted;
		const optimized = runtimePruner.transform(withStylesheetImport, id);
		if (optimized !== null) return optimized;
		return withStylesheetImport === code ? null : { code: withStylesheetImport, map: null };
	};

	/** Render the full single-sheet body (default mode / debug manifest). */
	const collectBody = (files: Array<string> = workspace.files()): string => {
		if (bodyCache !== undefined && workspace.isFresh(files, bodyCache.files))
			return bodyCache.value;
		const sheet = collect(files);
		const web = sheet.gen.web();
		const body = render(
			mergeEntries(sheet.gen.atomicEntries(), externalAtomic),
			mergeEntries(sheet.gen.varEntries(), externalVars),
			mergeTokenEntries(sheet.gen.tokenEntries(), externalTokens)
				.map((entry) => entry.declaration)
				.join("\n"),
			mergeCssSections(web, externalWeb),
			sheet.gen.keyframes(),
			options.cascade,
			[...sheet.gen.atomicEntries(), ...sheet.gen.varEntries(), ...externalAtomic, ...externalVars],
		);
		if (options.debug !== true) {
			bodyCache = { files, value: body };
			return body;
		}
		// Dev-only origin manifest: which scanned file feeds how many
		// style objects into the sheet. Search a class here to find its
		// candidate files; zero prod cost (flag off by default).
		const manifest = [...workspace.entries()]
			.toSorted((a, b) => a[0].localeCompare(b[0]))
			.map(([file, entry]) =>
				entry.sources.length === 0
					? `/*   ${file.replace(root + "/", "")} — no static css calls */`
					: entry.sources
							.map(
								({ provenance }) =>
									`/*   ${file.replace(root + "/", "")}:${provenance.line}:${provenance.column} ${provenance.callKind} */`,
							)
							.join("\n"),
			)
			.join("\n");
		const value =
			`/* pandwind debug manifest — ${workspace.entries().size} file(s), dev builds only */\n` +
			(manifest === "" ? "/*   (no css() sources scanned) */" : manifest) +
			"\n\n" +
			body;
		bodyCache = { files, value };
		return value;
	};

	/** Render only preset-owned web CSS for external compiler modes. */
	const collectWebBody = (): string => {
		const sheet = createStylesheet(
			preset,
			{ className, namespace, tokenVariableNames: options.tokenVariableNames },
			{ tokens: "used" },
		);
		const web = sheet.gen.web();
		return render(
			[],
			[],
			mergeTokenEntries(sheet.gen.tokenEntries(), externalTokens)
				.map((entry) => entry.declaration)
				.join("\n"),
			mergeCssSections(web, externalWeb),
			"",
			options.cascade,
			[],
		);
	};

	/** Re-scan changed files and return a fresh stylesheet with every rule. */
	const collect = (files: Array<string> = workspace.files()) => {
		const sheet = createStylesheet(
			preset,
			{ className, namespace, tokenVariableNames: options.tokenVariableNames },
			{ tokens: "used" },
		);
		const seen = new Set(files);

		for (const file of files) {
			const entry = workspace.scan(file);
			for (const { style } of entry.sources) sheet.process([style]);
			for (const { body } of entry.keyframes) sheet.processKeyframes(body);
			sheet.processPrepared(options.engine?.preparedStyles.get(file) ?? []);
			for (const key of entry.varKeys) sheet.processVarKey(key);
			for (const key of carriedVarKeys.get(file) ?? []) sheet.processVarKey(key);
		}

		workspace.prune(seen);

		return sheet;
	};

	/** Cached styles/var-keys for one file (re-scanning on mtime change). */
	const scanFile = (file: string) => workspace.scan(file);

	interface BucketSheet {
		tokenEntries: Array<{ declaration: string; priority: number }>;
		web: string;
		atomicIds: Set<string>;
		varIds: Set<string>;
		keyframeIds: Set<string>;
		atomic: Array<{ id: string; css: string; priority: number }>;
		vars: Array<{ id: string; css: string; priority: number }>;
		keyframes: Array<{ id: string; css: string; priority: number }>;
	}

	/** Build a sheet from ONLY the given files and list its rule identities. */
	const buildBucket = (files: Array<string>): BucketSheet => {
		const sheet = createStylesheet(
			preset,
			{ className, namespace, tokenVariableNames: options.tokenVariableNames },
			{ tokens: "used" },
		);
		for (const file of files) {
			const entry = scanFile(file);
			for (const { style } of entry.sources) sheet.process([style]);
			for (const { body } of entry.keyframes) sheet.processKeyframes(body);
			sheet.processPrepared(options.engine?.preparedStyles.get(file) ?? []);
			for (const key of entry.varKeys) sheet.processVarKey(key);
			for (const key of carriedVarKeys.get(file) ?? []) sheet.processVarKey(key);
		}
		const web = sheet.gen.web();
		const atomic = sheet.gen.atomicEntries();
		const vars = sheet.gen.varEntries();
		const keyframes = sheet.gen.keyframesEntries();
		// Ids are namespaced by kind ("a:"/"v:"/"k:") so the shared-rule
		// intersection can count them in one map without collisions.
		return {
			tokenEntries: sheet.gen.tokenEntries(),
			web,
			atomicIds: new Set(atomic.map((e) => `a:${e.id}`)),
			varIds: new Set(vars.map((e) => `v:${e.id}`)),
			keyframeIds: new Set(keyframes.map((e) => `k:${e.id}`)),
			atomic,
			vars,
			keyframes,
		};
	};

	/**
	 * Per-route splitting (plans/014 §2, opt-in via splitByRoute). Each file
	 * belongs to the FIRST matching route; unmatched files are common. Rules
	 * produced by >=2 route buckets are shared -> common chunk (together with
	 * every common-bucket rule); the rest stay route-exclusive. Tokens are
	 * preset-derived and identical everywhere -> common chunk.
	 */
	const collectSplit = (
		files: Array<string> = workspace.files(),
	): { common: string; routes: Map<string, string> } => {
		if (splitCache !== undefined && workspace.isFresh(files, splitCache.files))
			return splitCache.value;
		const commonFiles: Array<string> = [];
		const routeFiles = new Map<string, Array<string>>();
		for (const route of routes) routeFiles.set(route.name, []);
		for (const file of files) {
			const hit = routes.find((r) => r.match.test(file));
			if (hit === undefined) commonFiles.push(file);
			else routeFiles.get(hit.name)!.push(file);
		}

		const buckets = new Map<string, BucketSheet>();
		for (const [name, routeFilesList] of routeFiles) {
			buckets.set(name, buildBucket(routeFilesList));
		}
		buckets.set(COMMON_BUCKET, buildBucket(commonFiles));

		// Shared = produced by >=2 ROUTE buckets (the common bucket is common
		// by definition, handled below).
		const seenIn = new Map<string, number>();
		for (const [name, bucket] of buckets) {
			if (name === COMMON_BUCKET) continue;
			for (const id of [...bucket.atomicIds, ...bucket.varIds, ...bucket.keyframeIds]) {
				seenIn.set(id, (seenIn.get(id) ?? 0) + 1);
			}
		}
		const sharedIds = new Set([...seenIn.entries()].filter(([, n]) => n >= 2).map(([id]) => id));
		for (const rule of externalAtomic) sharedIds.add(`a:${rule.id}`);
		for (const rule of externalVars) sharedIds.add(`v:${rule.id}`);
		const routeBuckets = [...buckets.entries()]
			.filter(([name]) => name !== COMMON_BUCKET)
			.map(([, bucket]) => bucket);

		const pickCommon = <TEntry extends { readonly id: string }>(
			entries: readonly TEntry[],
			kind: "a" | "v" | "k",
		): TEntry[] => entries.filter((entry) => sharedIds.has(`${kind}:${entry.id}`));

		const commonBucket = buckets.get(COMMON_BUCKET)!;
		const tokenEntries = Array.from(
			new Map(
				[...buckets.values(), { tokenEntries: externalTokens }]
					.flatMap((bucket) => bucket.tokenEntries)
					.map((entry) => [entry.declaration, entry] as const),
			).values(),
		).toSorted((a, b) => {
			const priority = a.priority - b.priority;
			return priority === 0 ? a.declaration.localeCompare(b.declaration) : priority;
		});
		const commonAtomic = mergeEntries(
			[...routeBuckets.flatMap((bucket) => pickCommon(bucket.atomic, "a")), ...commonBucket.atomic],
			externalAtomic,
		).toSorted((a, b) => a.priority - b.priority);
		const commonVars = mergeEntries(
			[...routeBuckets.flatMap((bucket) => pickCommon(bucket.vars, "v")), ...commonBucket.vars],
			externalVars,
		).toSorted((a, b) => a.priority - b.priority);
		const commonKeyframes = mergeEntries(
			[
				...routeBuckets.flatMap((bucket) => pickCommon(bucket.keyframes, "k")),
				...commonBucket.keyframes,
			],
			[],
		);
		const priorityUniverse = [...buckets.values()].flatMap((bucket) => [
			...bucket.atomic,
			...bucket.vars,
		]);
		priorityUniverse.push(...externalAtomic, ...externalVars);

		const common = render(
			commonAtomic,
			commonVars,
			tokenEntries.map((entry) => entry.declaration).join("\n"),
			mergeCssSections(commonBucket.web, externalWeb),
			commonKeyframes.map((entry) => entry.css).join("\n"),
			options.cascade,
			priorityUniverse,
		);

		const out = new Map<string, string>();
		for (const [name, bucket] of buckets) {
			if (name === COMMON_BUCKET) continue;
			const atomic = bucket.atomic.filter((e) => !sharedIds.has(`a:${e.id}`));
			const vars = bucket.vars.filter((e) => !sharedIds.has(`v:${e.id}`));
			const keyframes = bucket.keyframes.filter((e) => !sharedIds.has(`k:${e.id}`));
			out.set(
				name,
				render(
					atomic,
					vars,
					"",
					"",
					keyframes.map((entry) => entry.css).join("\n"),
					options.cascade,
					priorityUniverse,
				),
			);
		}
		const value = { common, routes: out };
		splitCache = { files, value };
		return value;
	};

	let command: "build" | "serve" | undefined;
	const inlineCritical = options.inlineCritical;
	const isBuild = (): boolean => command === "build";

	return {
		name: "pandwind:extract-css",
		configResolved(config) {
			command = config.command;
		},
		closeBundle(sourceFiles?: Array<string>) {
			if (!isBuild()) return;
			if (inlineCritical === undefined) return; // off by default
			const cap =
				inlineCritical === undefined
					? undefined
					: inlineCritical === true
						? undefined
						: inlineCritical.capBytes;
			for (const route of routes) {
				if (route.html === undefined) continue;
				const htmlPath = resolve(root, route.html);
				let html: string;
				try {
					html = readFileSync(htmlPath, "utf8");
				} catch {
					continue; // no such entry — nothing to inline into
				}
				const split = collectSplit(sourceFiles);
				const css = `${split.common}
${split.routes.get(route.name) ?? ""}`;
				const result = renderCriticalHtml({
					html,
					routeName: route.name,
					css,
					capBytes: cap,
					namespace,
				});
				if (result.ok) writeFileSync(htmlPath, result.html);
			}
		},
		transform,
		resolveId(source: string) {
			const runtime = runtimePruner.resolveId(source);
			if (runtime !== null) return runtime;
			if (source === virtualId) return resolvedVirtualId;
			if (source === `${virtualId}-manifest`) return resolvedManifestId;
			if (routes.length > 0 && source.startsWith(`${virtualId}?route=`)) {
				const name = decodeURIComponent(source.slice(`${virtualId}?route=`.length));
				if (routes.some((r) => r.name === name)) return routeChunkId(name);
			}
			return null;
		},
		load(id: string) {
			const isStylesheet =
				id === resolvedVirtualId ||
				(routes.length > 0 && id.startsWith(`\0${virtualId}.css?route=`));
			return this.loadForFiles(id, isStylesheet ? workspace.files() : []);
		},
		loadForFiles(id: string, sourceFiles: Array<string>) {
			const runtime = runtimePruner.load(id);
			if (runtime !== null) return runtime;
			// External-compiler modes serve empty CSS; sheet-backed strategies
			// still need the generated stylesheet (with their class names).
			const emptyMode = className !== undefined && strategy?.sheetBacked !== true;

			if (id === resolvedVirtualId) {
				if (emptyMode) return collectWebBody();
				if (routes.length === 0) return collectBody(sourceFiles);
				return collectSplit(sourceFiles).common;
			}

			if (routes.length > 0 && id === resolvedManifestId) {
				const map = Object.fromEntries(routes.map((r) => [r.name, `${virtualId}?route=${r.name}`]));
				return (
					`// pandwind per-route CSS splitting (plans/014 \u00a72) — route -> virtual module id.\n` +
					`export const routeSheets = ${JSON.stringify(map, null, "\t")} as const;\n` +
					`export default routeSheets;\n`
				);
			}

			if (routes.length > 0 && id.startsWith(`\0${virtualId}.css?route=`)) {
				if (emptyMode) return "";
				const name = decodeURIComponent(id.slice(`\0${virtualId}.css?route=`.length));
				return collectSplit(sourceFiles).routes.get(name) ?? "";
			}
			return null;
		},
		invalidate(file: string) {
			// The next load re-scans the changed file and refreshes the rendered
			// stylesheet. Clearing even an unknown path also covers added files.
			workspace.invalidate(file);
			carriedVarKeys.delete(file);
			bodyCache = undefined;
			splitCache = undefined;
		},
	};
}
