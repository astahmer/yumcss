/**
 * Bundler-agnostic core of the css() static extractor: transform (tailwind /
 * sheet-backed strategy modes), virtual-module `resolveId`/`load`, and cache
 * invalidation. Shared by `pandwindCssVite` and the unplugin adapters.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createStylesheet } from "../css/create-stylesheet.ts";
import { extractCssFile, extractVarKeys } from "./css-extract.ts";
import { normalizeStrategy } from "../css/class-name-strategy.ts";
import { renderCriticalHtml } from "./critical-css.ts";
import type { CssExtractorPreset, PandwindCssViteOptions } from "./css.ts";
import { extractCssSources, findCssImports, inlineCssCalls } from "./css-extract.ts";

export type { CssExtractorPreset };

export interface CssExtractorCore {
	/** Vite hook: capture the command so closeBundle only runs on builds. */
	configResolved(config: { command?: "build" | "serve" }): void;
	/** Build-only: inline route critical chunks into configured HTML entries. */
	closeBundle(): void;
	name: string;
	/** Present only in tailwind / sheet-backed strategy modes. */
	transform?(code: string, id: string): { code: string; map: null } | null;
	resolveId(source: string): string | null;
	load(id: string): string | null;
	invalidate(file: string): void;
}

/** Join sheet sections into one CSS document, dropping empties. */
const render = (
	atomic: Array<{ css: string }>,
	vars: Array<{ css: string }>,
	tokens: string,
): string =>
	[tokens, atomic.map((e) => e.css).join("\n"), vars.map((e) => e.css).join("\n")]
		.filter(Boolean)
		.join("\n");

export function createCssExtractorPluginCore(
	preset: CssExtractorPreset,
	options: PandwindCssViteOptions = {},
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
	const strategy = normalizeStrategy(className);
	// External-compiler modes (tailwind): the sheet stays empty. Sheet-backed
	// strategies still get the generated stylesheet — with their class names.
	// The `.css` suffix makes vite's CSS pipeline (and its dev injection)
	// treat the virtual module as stylesheet, not JavaScript.
	const resolvedVirtualId = `\0${virtualId}.css`;
	const root = options.root ?? process.cwd();
	const include = options.include ?? [/\.(?:[cm]?[jt]sx?)$/];
	const exclude = options.exclude ?? [/node_modules/, /(^|\/)dist(\/|$)/, /\.git/];
	const fileCache = new Map<
		string,
		{ mtimeMs: number; sources: ReturnType<typeof extractCssSources>; varKeys: string[] }
	>();
	type RenderCache<T> = { files: Array<string>; value: T };
	let bodyCache: RenderCache<string> | undefined;
	let splitCache: RenderCache<{ common: string; routes: Map<string, string> }> | undefined;
	const routes = options.splitByRoute ?? [];
	const COMMON_BUCKET = "__common__";
	const resolvedManifestId = `\0${virtualId}-manifest.js`;
	const routeChunkId = (name: string): string => `\0${virtualId}.css?route=${name}`;

	const isScanned = (file: string): boolean => {
		if (!include.some((pattern) => pattern.test(file))) return false;
		if (exclude.some((pattern) => pattern.test(file))) return false;
		return true;
	};

	const walkFiles = (dir: string, acc: string[] = []): string[] => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (entry.name.startsWith(".")) continue;
			const path = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (exclude.some((pattern) => pattern.test(path))) continue;
				walkFiles(path, acc);
			} else if (entry.isFile() && isScanned(path)) {
				acc.push(path);
			}
		}
		return acc;
	};

	const isFresh = (files: Array<string>, cached: RenderCache<unknown>): boolean => {
		if (files.length !== cached.files.length) return false;
		for (let index = 0; index < files.length; index++) {
			if (files[index] !== cached.files[index]) return false;
			const file = files[index]!;
			const entry = fileCache.get(file);
			if (entry === undefined) return false;
			try {
				if (entry.mtimeMs !== statSync(file).mtimeMs) return false;
			} catch {
				return false;
			}
		}
		return true;
	};

	const transform =
		className === undefined
			? undefined
			: (code: string, id: string): { code: string; map: null } | null => {
					if (id.includes("node_modules")) return null;
					if (!isScanned(id)) return null;
					const names = findCssImports(code, id, matchers);
					if (names.size === 0) return null;
					const result = inlineCssCalls(code, id, names, preset, className);
					return result.inlined === 0 ? null : { code: result.code, map: null };
				};

	/** Render the full single-sheet body (default mode / debug manifest). */
	const collectBody = (): string => {
		const files = walkFiles(root);
		if (bodyCache !== undefined && isFresh(files, bodyCache)) return bodyCache.value;
		const sheet = collect(files);
		const tokens = sheet.gen.tokens();
		const atomic = sheet.gen.atomic();
		const varRules = sheet.gen.varRules();
		const body = [tokens, atomic, varRules].filter(Boolean).join("\n");
		if (options.debug !== true) {
			bodyCache = { files, value: body };
			return body;
		}
		// Dev-only origin manifest: which scanned file feeds how many
		// style objects into the sheet. Search a class here to find its
		// candidate files; zero prod cost (flag off by default).
		const manifest = [...fileCache.entries()]
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
			`/* pandwind debug manifest — ${fileCache.size} file(s), dev builds only */\n` +
			(manifest === "" ? "/*   (no css() sources scanned) */" : manifest) +
			"\n\n" +
			body;
		bodyCache = { files, value };
		return value;
	};

	/** Re-scan changed files and return a fresh stylesheet with every rule. */
	const collect = (files: Array<string> = walkFiles(root)) => {
		const sheet = createStylesheet(preset, { className });
		const seen = new Set<string>();

		for (const file of files) {
			seen.add(file);
			let entry = fileCache.get(file);
			const mtimeMs = statSync(file).mtimeMs;
			if (!entry || entry.mtimeMs !== mtimeMs) {
				const code = readFileSync(file, "utf8");
				const { sources, varKeys } = extractCssFile(code, file, matchers, preset);
				entry = { mtimeMs, sources, varKeys };
				fileCache.set(file, entry);
			}
			for (const { style } of entry.sources) sheet.process([style]);
			for (const key of entry.varKeys) sheet.processVarKey(key);
		}

		// Drop files that were deleted since the last scan.
		for (const file of fileCache.keys()) {
			if (!seen.has(file)) fileCache.delete(file);
		}

		return sheet;
	};

	/** Cached styles/var-keys for one file (re-scanning on mtime change). */
	const scanFile = (
		file: string,
	): { sources: ReturnType<typeof extractCssSources>; varKeys: string[] } => {
		let entry = fileCache.get(file);
		const mtimeMs = statSync(file).mtimeMs;
		if (!entry || entry.mtimeMs !== mtimeMs) {
			const code = readFileSync(file, "utf8");
			const { sources, varKeys } = extractCssFile(code, file, matchers, preset);
			entry = { mtimeMs, sources, varKeys };
			fileCache.set(file, entry);
		}
		return entry;
	};

	interface BucketSheet {
		tokens: string;
		atomicIds: Set<string>;
		varIds: Set<string>;
		atomic: Array<{ id: string; css: string; priority: number }>;
		vars: Array<{ id: string; css: string; priority: number }>;
	}

	/** Build a sheet from ONLY the given files and list its rule identities. */
	const buildBucket = (files: Array<string>): BucketSheet => {
		const sheet = createStylesheet(preset, { className });
		for (const file of files) {
			const entry = scanFile(file);
			for (const { style } of entry.sources) sheet.process([style]);
			for (const key of entry.varKeys) sheet.processVarKey(key);
		}
		const atomic = sheet.gen.atomicEntries();
		const vars = sheet.gen.varEntries();
		// Ids are namespaced by kind ("a:"/"v:") so the shared-rule
		// intersection can count them in one map without collisions.
		return {
			tokens: sheet.gen.tokens(),
			atomicIds: new Set(atomic.map((e) => `a:${e.id}`)),
			varIds: new Set(vars.map((e) => `v:${e.id}`)),
			atomic,
			vars,
		};
	};

	/**
	 * Per-route splitting (plans/014 §2, opt-in via splitByRoute). Each file
	 * belongs to the FIRST matching route; unmatched files are common. Rules
	 * produced by >=2 route buckets are shared -> common chunk (together with
	 * every common-bucket rule); the rest stay route-exclusive. Tokens are
	 * preset-derived and identical everywhere -> common chunk.
	 */
	const collectSplit = (): { common: string; routes: Map<string, string> } => {
		const files = walkFiles(root);
		if (splitCache !== undefined && isFresh(files, splitCache)) return splitCache.value;
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
			for (const id of [...bucket.atomicIds, ...bucket.varIds]) {
				seenIn.set(id, (seenIn.get(id) ?? 0) + 1);
			}
		}
		const sharedIds = new Set([...seenIn.entries()].filter(([, n]) => n >= 2).map(([id]) => id));

		const pickCommon = (
			entries: BucketSheet["atomic"],
			kind: "a" | "v",
		): Array<{ css: string; priority: number }> =>
			entries.filter((e) => sharedIds.has(`${kind}:${e.id}`));

		const commonBucket = buckets.get(COMMON_BUCKET)!;
		const anyBucket = buckets.get(routes[0]!.name)!;
		const commonAtomic = [
			...pickCommon(anyBucket.atomic, "a"),
			...commonBucket.atomic.map((e) => ({ ...e, id: `a:${e.id}` })),
		].toSorted((a, b) => a.priority - b.priority);
		const commonVars = [
			...pickCommon(anyBucket.vars, "v"),
			...commonBucket.vars.map((e) => ({ ...e, id: `v:${e.id}` })),
		].toSorted((a, b) => a.priority - b.priority);

		const common = render(commonAtomic, commonVars, commonBucket.tokens || anyBucket.tokens);

		const out = new Map<string, string>();
		for (const [name, bucket] of buckets) {
			if (name === COMMON_BUCKET) continue;
			const atomic = bucket.atomic.filter((e) => !sharedIds.has(`a:${e.id}`));
			const vars = bucket.vars.filter((e) => !sharedIds.has(`v:${e.id}`));
			out.set(name, render(atomic, vars, ""));
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
		closeBundle() {
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
				const split = collectSplit();
				const css = `${split.common}
${split.routes.get(route.name) ?? ""}`;
				const result = renderCriticalHtml({
					html,
					routeName: route.name,
					css,
					capBytes: cap,
				});
				if (result.ok) writeFileSync(htmlPath, result.html);
			}
		},
		transform,
		resolveId(source: string) {
			if (source === virtualId) return resolvedVirtualId;
			if (source === `${virtualId}-manifest`) return resolvedManifestId;
			if (routes.length > 0 && source.startsWith(`${virtualId}?route=`)) {
				const name = decodeURIComponent(source.slice(`${virtualId}?route=`.length));
				if (routes.some((r) => r.name === name)) return routeChunkId(name);
			}
			return null;
		},
		load(id: string) {
			// External-compiler modes serve empty CSS; sheet-backed strategies
			// still need the generated stylesheet (with their class names).
			const emptyMode = className !== undefined && strategy?.sheetBacked !== true;

			if (id === resolvedVirtualId) {
				if (emptyMode) return "";
				if (routes.length === 0) return collectBody();
				return collectSplit().common;
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
				return collectSplit().routes.get(name) ?? "";
			}
			return null;
		},
		invalidate(file: string) {
			// The next load re-scans the changed file and refreshes the rendered
			// stylesheet. Clearing even an unknown path also covers added files.
			fileCache.delete(file);
			bodyCache = undefined;
			splitCache = undefined;
		},
	};
}
