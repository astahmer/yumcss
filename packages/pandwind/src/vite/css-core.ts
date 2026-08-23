/**
 * Bundler-agnostic core of the css() static extractor: transform (tailwind /
 * sheet-backed strategy modes), virtual-module `resolveId`/`load`, and cache
 * invalidation. Shared by `pandwindCssVite` and the unplugin adapters.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createStylesheet } from "../css/create-stylesheet.ts";
import { extractVarKeys } from "./css-extract.ts";
import { normalizeStrategy } from "../css/class-name-strategy.ts";
import type { StyleObject } from "../types/typings.ts";
import type { CssExtractorPreset, PandwindCssViteOptions } from "./css.ts";
import { extractCssStyles, findCssImports, inlineCssCalls, isCssSource } from "./css-extract.ts";

export type { CssExtractorPreset };

export interface CssExtractorCore {
	name: string;
	/** Present only in tailwind / sheet-backed strategy modes. */
	transform?(code: string, id: string): { code: string; map: null } | null;
	resolveId(source: string): string | null;
	load(id: string): string | null;
	invalidate(file: string): void;
}

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
		{ mtimeMs: number; styles: StyleObject[]; varKeys: string[] }
	>();

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

	const transform =
		className === undefined
			? undefined
			: (code: string, id: string): { code: string; map: null } | null => {
					if (id.includes("node_modules")) return null;
					if (!isScanned(id)) return null;
					if (!/\bcss\b/.test(code)) return null;
					const names = findCssImports(code, id, matchers);
					if (names.size === 0) return null;
					const result = inlineCssCalls(code, id, names, preset, className);
					return result.inlined === 0 ? null : { code: result.code, map: null };
				};

	/** Re-scan changed files and return a fresh stylesheet with every rule. */
	const collect = () => {
		const sheet = createStylesheet(preset, { className });
		const seen = new Set<string>();

		for (const file of walkFiles(root)) {
			seen.add(file);
			let entry = fileCache.get(file);
			const mtimeMs = statSync(file).mtimeMs;
			if (!entry || entry.mtimeMs !== mtimeMs) {
				const code = readFileSync(file, "utf8");
				const styles: StyleObject[] = [];
				let varKeys: string[] = [];
				if (/\bcss\b/.test(code)) {
					const names = findCssImports(code, file, matchers);
					if (names.size > 0) {
						styles.push(...extractCssStyles(code, file, names, preset));
						varKeys = extractVarKeys(code, file, names);
					}
				}
				entry = { mtimeMs, styles, varKeys };
				fileCache.set(file, entry);
			}
			for (const style of entry.styles) sheet.process([style]);
			for (const key of entry.varKeys) sheet.processVarKey(key);
		}

		// Drop files that were deleted since the last scan.
		for (const file of fileCache.keys()) {
			if (!seen.has(file)) fileCache.delete(file);
		}

		return sheet;
	};

	return {
		name: "pandwind:extract-css",
		transform,
		resolveId(source: string) {
			if (source === virtualId) return resolvedVirtualId;
			return null;
		},
		load(id: string) {
			if (id !== resolvedVirtualId) return null;
			// External-compiler modes serve empty CSS; sheet-backed strategies
			// still need the generated stylesheet (with their class names).
			if (className !== undefined && strategy?.sheetBacked !== true) return "";
			const sheet = collect();
			const tokens = sheet.gen.tokens();
			const atomic = sheet.gen.atomic();
			const varRules = sheet.gen.varRules();
			const body = [tokens, atomic, varRules].filter(Boolean).join("\n");
			if (options.debug !== true) return body;
			// Dev-only origin manifest: which scanned file feeds how many
			// style objects into the sheet. Search a class here to find its
			// candidate files; zero prod cost (flag off by default).
			const manifest = [...fileCache.entries()]
				.toSorted((a, b) => a[0].localeCompare(b[0]))
				.map(
					([file, entry]) =>
						`/*   ${file.replace(root + "/", "")} — ${entry.styles.length} style object(s) */`,
				)
				.join("\n");
			return (
				`/* pandwind debug manifest — ${fileCache.size} file(s), dev builds only */\n` +
				(manifest === "" ? "/*   (no css() sources scanned) */" : manifest) +
				"\n\n" +
				body
			);
		},
		invalidate(file: string) {
			// The next load re-scans the changed file.
			if (fileCache.has(file)) fileCache.delete(file);
		},
	};
}

// Re-exported so callers of the core keep the same surface as css.ts.
export { extractCssStyles, extractVarKeys, findCssImports, inlineCssCalls, isCssSource };
