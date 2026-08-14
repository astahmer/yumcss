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
 * can still be covered by the `tw:scan` safelist.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { parseSync } from "oxc-parser";
import { walk } from "../tw/literal.ts";
import { extractTwConfig, inlineTwCalls, type TwConfig } from "./inline.ts";

export interface PandwindViteOptions {
	/**
	 * Import sources that point at the generated tw module. Defaults to any
	 * source whose basename is `tw` (`./tw`, `../tw.ts`, ...).
	 */
	twSources?: Array<string | RegExp>;
	/** Files to skip, as regexes matched against the module id. */
	exclude?: RegExp[];
}

interface Resolver {
	resolve(
		source: string,
		importer: string,
		options?: { skipSelf?: boolean },
	): Promise<{ id: string } | null> | { id: string } | null | undefined;
}

interface ImportInfo {
	localNames: Set<string>;
	sources: string[];
}

/** Collect local bindings imported from tw modules in `code`. */
function findTwImports(
	code: string,
	id: string,
	isTwSource: (source: string) => boolean,
): ImportInfo {
	const result = parseSync(id, code, {
		sourceType: "module",
		lang: id.endsWith(".tsx") ? "tsx" : "ts",
	});
	const info: ImportInfo = { localNames: new Set(), sources: [] };

	walk(result.program, (node) => {
		if (node.type !== "ImportDeclaration") return;
		const source = (node as { source?: { value?: string } }).source?.value;
		if (typeof source !== "string" || !isTwSource(source)) return;
		info.sources.push(source);
		for (const specifier of (node as { specifiers?: OxcSpecifier[] })
			.specifiers ?? []) {
			if (specifier.type !== "ImportSpecifier") continue;
			const imported = (specifier as { imported?: { name?: string } }).imported
				?.name;
			const local = (specifier as { local?: { name?: string } }).local?.name;
			if (imported === "tw" && typeof local === "string") {
				info.localNames.add(local);
			}
		}
	});
	return info;
}

interface OxcSpecifier {
	type: string;
}

/**
 * Create the vite plugin. The transform is idempotent: already-inlined string
 * literals are never tw calls, so repeated runs are safe.
 */
export function pandwindVite(options: PandwindViteOptions = {}) {
	const configCache = new Map<string, TwConfig>();
	const isTwSource = (source: string): boolean => {
		if (options.twSources !== undefined) {
			return options.twSources.some((matcher) =>
				typeof matcher === "string"
					? source === matcher || source.endsWith(`/${matcher}`)
					: matcher.test(source),
			);
		}
		return basename(source).replace(/\.[jt]sx?$/, "") === "tw";
	};

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
		const sourceCode = readFileSync(resolved.id, "utf8");
		const config = extractTwConfig(sourceCode);
		if (config !== undefined) configCache.set(resolved.id, config);
		return config;
	};

	return {
		name: "pandwind:inline-tw",
		enforce: "pre",
		async transform(this: Resolver, code: string, id: string) {
			if (id.includes("node_modules")) return null;
			if (options.exclude?.some((pattern) => pattern.test(id))) return null;
			if (!/\btw\b/.test(code)) return null;

			const imports = findTwImports(code, id, isTwSource);
			if (imports.localNames.size === 0 || imports.sources.length === 0) {
				return null;
			}

			let config: TwConfig | undefined;
			for (const source of imports.sources) {
				config = await loadConfig(this, id, source);
				if (config !== undefined) break;
			}
			if (config === undefined) return null;

			const result = inlineTwCalls(code, id, config, imports.localNames);
			return result.inlined === 0 ? null : { code: result.code, map: null };
		},
	};
}

export { type PandwindCssViteOptions, pandwindCssVite } from "./css.ts";
