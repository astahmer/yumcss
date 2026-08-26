/**
 * Transitive css import crawler (plans/023 #3).
 *
 * The studio must see @theme tokens defined in css files REACHED via
 * @import, not just the entry stylesheet: e.g.
 * `packages/geos/src/styles.css` does `@import 'shadcn/tailwind.css'` and
 * every token in that file was invisible before.
 *
 * Resolution rules for an import specifier S found in file F:
 * - relative (`./x.css`, `../x.css`)  -> resolve(F.dir, S)
 * - bare (`shadcn/tailwind.css`)      -> tried against, in order:
 *   <root>/node_modules/S, <root>/<appDir>/** via node resolution from F's
 *   directory upward (node_modules walk), each with `.css` appended when
 *   missing (css imports omit extensions constantly).
 *
 * Cycle-safe (visited set) and depth-capped. Only local/relative and
 * node_modules imports are followed; URLs (`https://…`) are ignored.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

const MAX_DEPTH = 8;

export interface CrawledCss {
	/** Every css file reached, entry points included (absolute paths). */
	files: string[];
	/** Concatenated contents, entries first, import order after. */
	contents: Array<{ path: string; content: string }>;
	/** Imports that could not be resolved (reported, not fatal). */
	unresolved: Array<{ from: string; specifier: string }>;
}

const IMPORT_REGEX = /@import\s+(?:["']([^"']+)["']|url\(\s*["']?([^"')]+)["']?\s*\))/g;

const isUrl = (specifier: string): boolean =>
	specifier.startsWith("http://") ||
	specifier.startsWith("https://") ||
	specifier.startsWith("data:");

/**
 * Package-exports aware lookup: `pkg/tailwind.css` may map through
 * package.json `exports["./tailwind.css"]` to e.g. `./dist/tailwind.css`
 * (pnpm layouts never contain the literal file).
 */
function tryExportsSubpath(pkgDir: string, subpath: string): string | null {
	try {
		const pkgJsonPath = resolve(pkgDir, "package.json");
		if (!existsSync(pkgJsonPath)) return null;
		const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as {
			exports?: Record<string, unknown>;
		};
		const entry =
			pkgJson.exports?.[`./${subpath}`] ??
			pkgJson.exports?.[subpath] ??
			(typeof pkgJson.exports === "string" ? pkgJson.exports : undefined);
		const target =
			typeof entry === "string"
				? entry
				: typeof entry === "object" && entry !== null
					? ((entry as Record<string, string>).default ??
						(entry as Record<string, string>).style ??
						Object.values(entry as Record<string, string>)[0])
					: undefined;
		if (typeof target !== "string") return null;
		const resolvedTarget = resolve(pkgDir, target);
		if (existsSync(resolvedTarget)) return resolvedTarget;
	} catch {
		// malformed package.json — fall through
	}
	return null;
}

function resolveSpecifier(specifier: string, fromFile: string, root: string): string | null {
	const candidates: string[] = [];
	if (specifier.startsWith(".")) {
		candidates.push(resolve(dirname(fromFile), specifier));
	} else if (!isAbsolute(specifier)) {
		// package-style: walk node_modules upward from the importing file
		let dir = dirname(fromFile);
		for (;;) {
			candidates.push(resolve(dir, "node_modules", specifier));
			const parent = resolve(dir, "..");
			if (parent === dir || !dir.startsWith(root)) break;
			dir = parent;
		}
	} else {
		candidates.push(specifier);
	}
	for (const candidate of candidates) {
		if (existsSync(candidate) && statIsFile(candidate)) return candidate;
		if (!candidate.endsWith(".css")) {
			const withCss = `${candidate}.css`;
			if (existsSync(withCss) && statIsFile(withCss)) return withCss;
			const index = resolve(candidate, "index.css");
			if (existsSync(index) && statIsFile(index)) return index;
		}
	}
	// bare specifiers last chance: package.json exports mapping
	if (!specifier.startsWith(".") && !isAbsolute(specifier)) {
		const slash = specifier.indexOf("/");
		const pkgName = specifier.startsWith("@")
			? specifier.slice(0, specifier.indexOf("/", 1) + 0)
			: specifier.slice(0, slash === -1 ? specifier.length : slash);
		const subpath = slash === -1 ? "" : specifier.slice(slash + 1);
		let dir = dirname(fromFile);
		for (;;) {
			const pkgDir = resolve(dir, "node_modules", pkgName);
			if (existsSync(pkgDir)) {
				const hit =
					subpath === ""
						? tryExportsSubpath(pkgDir, ".")
						: (tryExportsSubpath(pkgDir, subpath) ??
							tryExportsSubpath(pkgDir, `${subpath}.css`) ??
							tryExportsSubpath(pkgDir, `${subpath}/index.css`));
				if (hit !== null) return hit;
			}
			const parent = resolve(dir, "..");
			if (parent === dir || !dir.startsWith(root)) break;
			dir = parent;
		}
	}
	return null;
}

function statIsFile(path: string): boolean {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}

/**
 * Crawl css files transitively following @import. Returns every reached
 * file's content so callers can extract @theme blocks (or anything else).
 */
export function crawlCssImports(entryPaths: string[], root: string): CrawledCss {
	const out: CrawledCss = { files: [], contents: [], unresolved: [] };
	const visited = new Set<string>();

	const visit = (path: string, depth: number): void => {
		const real = resolve(path);
		if (visited.has(real) || depth > MAX_DEPTH) return;
		visited.add(real);
		let content: string;
		try {
			content = readFileSync(real, "utf8");
		} catch {
			return;
		}
		out.files.push(real);
		out.contents.push({ path: real, content });
		for (const match of content.matchAll(IMPORT_REGEX)) {
			const specifier = (match[1] ?? match[2] ?? "").trim();
			if (specifier === "" || isUrl(specifier)) continue;
			const target =
				specifier.startsWith(".") || isAbsolute(specifier)
					? resolveSpecifier(specifier, real, root)
					: resolveSpecifier(specifier, real, root);
			if (target === null) {
				out.unresolved.push({ from: real, specifier });
				continue;
			}
			visit(target, depth + 1);
		}
	};

	for (const entry of entryPaths) visit(entry, 0);
	return out;
}
