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
import type { AnyClassNameStrategy } from "../css/class-name-strategy.ts";
import { createStylesheet } from "../css/create-stylesheet.ts";
import { normalizeStrategy } from "../css/class-name-strategy.ts";
import type {
	AnyCssConfig,
	AnyTokens,
	CssConfigReturn,
	DefinePresetOptions,
	StyleObject,
} from "../types/typings.ts";
import { extractCssStyles, findCssImports, inlineCssCalls, isCssSource } from "./css-extract.ts";
import type { PandwindEngineContext } from "./engine-context.ts";

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
	className?: AnyClassNameStrategy;
	/**
	 * Shared engine context (createPandwindEngineContext). When supplied it
	 * must carry the same preset, and its class-name strategy wins over
	 * `className` — pass the SAME context to `pandwindVite({ css })` to wire
	 * both plugins to one configuration source.
	 */
	engine?: PandwindEngineContext;
}

export type CssExtractorPreset = CssConfigReturn<DefinePresetOptions<AnyCssConfig, AnyTokens>>;

/**
 * Create the css() static extractor. The preset must be the same object
 * passed to `createDesignCss` in app code — it drives both resolution and
 * token output, so the generated CSS matches the runtime byte-for-byte.
 */
export function pandwindCssVite(preset: CssExtractorPreset, options: PandwindCssViteOptions = {}) {
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
	const fileCache = new Map<string, { mtimeMs: number; styles: StyleObject[] }>();

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
			: {
					name: "pandwind:extract-css",
					enforce: "pre" as const,
					transform(code: string, id: string) {
						if (id.includes("node_modules")) return null;
						if (!isScanned(id)) return null;
						if (!/\bcss\b/.test(code)) return null;
						const names = findCssImports(code, id, matchers);
						if (names.size === 0) return null;
						const result = inlineCssCalls(code, id, names, preset, className);
						return result.inlined === 0 ? null : { code: result.code, map: null };
					},
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
		...transform,
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
			return [tokens, atomic].filter(Boolean).join("\n");
		},
		handleHotUpdate(ctx: { file: string }) {
			// The next load re-scans the changed file.
			if (fileCache.has(ctx.file)) fileCache.delete(ctx.file);
		},
	};
}

export { extractCssStyles, findCssImports, inlineCssCalls, isCssSource };
