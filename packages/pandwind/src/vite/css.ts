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
 * `tw:scan` for the safelist) rather than collected from transforms — module
 * load order varies between dev and build, and the virtual stylesheet must be
 * complete no matter when it is requested. Every `css({ ... })` call with a
 * literal object is resolved through the design layer and its atomic rule is
 * added to a shared stylesheet; the virtual module serves the deduped CSS
 * (tokens + rules). The runtime hashes the same calls deterministically, so
 * runtime class names always match. Calls with dynamic arguments are skipped
 * — they need runtime styles, the same limitation as dynamic class names in
 * plain Tailwind.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createStylesheet } from "../css/create-stylesheet.ts";
import type {
	AnyCssConfig,
	AnyTokens,
	CssConfigReturn,
	DefinePresetOptions,
	StyleObject,
} from "../types/typings.ts";
import {
	extractCssStyles,
	findCssImports,
	isCssSource,
} from "./css-extract.ts";

export interface PandwindCssViteOptions {
	/**
	 * Import sources that point at the css() module. Defaults to any source
	 * whose basename is `css` or `design` (`./css`, `./design.ts`, ...).
	 */
	cssSources?: Array<string | RegExp>;
	/** Files to skip, as regexes matched against the module id. */
	exclude?: RegExp[];
	/** Files to scan, as regexes matched against the absolute path. */
	include?: RegExp[];
	/** Directory scanned for css() calls. Defaults to process.cwd(). */
	root?: string;
	/** The virtual module id the generated CSS is served under. */
	virtualId?: string;
}

export type CssExtractorPreset = CssConfigReturn<
	DefinePresetOptions<AnyCssConfig, AnyTokens>
>;

/**
 * Create the css() static extractor. The preset must be the same object
 * passed to `createDesignCss` in app code — it drives both resolution and
 * token output, so the generated CSS matches the runtime byte-for-byte.
 */
export function pandwindCssVite(
	preset: CssExtractorPreset,
	options: PandwindCssViteOptions = {},
) {
	const matchers = options.cssSources ?? ["css", "design"];
	const virtualId = options.virtualId ?? "pandwind:css";
	// The `.css` suffix makes vite's CSS pipeline (and its dev injection)
	// treat the virtual module as stylesheet, not JavaScript.
	const resolvedVirtualId = `\0${virtualId}.css`;
	const root = options.root ?? process.cwd();
	const include = options.include ?? [/\.(?:[cm]?[jt]sx?)$/];
	const exclude = options.exclude ?? [
		/node_modules/,
		/(^|\/)dist(\/|$)/,
		/\.git/,
	];
	const fileCache = new Map<
		string,
		{ mtimeMs: number; styles: StyleObject[] }
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

	/** Re-scan changed files and return a fresh stylesheet with every rule. */
	const collect = () => {
		const sheet = createStylesheet(preset);
		const seen = new Set<string>();

		for (const file of walkFiles(root)) {
			seen.add(file);
			let entry = fileCache.get(file);
			const mtimeMs = statSync(file).mtimeMs;
			if (!entry || entry.mtimeMs !== mtimeMs) {
				const code = readFileSync(file, "utf8");
				const styles: StyleObject[] = [];
				if (/\bcss\b/.test(code)) {
					const names = findCssImports(code, file, matchers);
					if (names.size > 0) {
						styles.push(...extractCssStyles(code, file, names, preset));
					}
				}
				entry = { mtimeMs, styles };
				fileCache.set(file, entry);
			}
			for (const style of entry.styles) sheet.process([style]);
		}

		// Drop files that were deleted since the last scan.
		for (const file of fileCache.keys()) {
			if (!seen.has(file)) fileCache.delete(file);
		}

		return sheet;
	};

	return {
		name: "pandwind:extract-css",
		enforce: "pre",
		resolveId(source: string) {
			if (source === virtualId) return resolvedVirtualId;
			return null;
		},
		load(id: string) {
			if (id !== resolvedVirtualId) return null;
			const sheet = collect();
			const tokens = sheet.gen.tokens();
			const atomic = sheet.gen.atomic();
			return [tokens, atomic].filter(Boolean).join("\n");
		},
		handleHotUpdate(ctx: { file: string }) {
			// The next load re-scans the changed file.
			if (fileCache.has(ctx.file)) fileCache.delete(ctx.file);
		},
	};
}

export { extractCssStyles, findCssImports, isCssSource };
