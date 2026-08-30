import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface ModuleSourceReader {
	read(path: string): string;
	mtime(path: string): number;
}

export interface ModulePathResolver {
	resolve(source: string, importerDir: string): string | undefined;
}

export class NodeModuleSourceReader implements ModuleSourceReader {
	read(path: string): string {
		return readFileSync(path, "utf8");
	}

	mtime(path: string): number {
		return statSync(path).mtimeMs;
	}
}

export class NodeModulePathResolver implements ModulePathResolver {
	private readonly extensions: readonly string[];

	constructor(
		extensions: readonly string[] = ["", ".ts", ".tsx", ".stylex.ts", ".js", ".jsx", ".stylex.js"],
	) {
		this.extensions = extensions;
	}

	resolve(source: string, importerDir: string): string | undefined {
		const bases: string[] = [];
		if (source.startsWith(".") || source.startsWith("/")) bases.push(resolve(importerDir, source));
		else {
			const parts = source.split("/");
			const packageName = source.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
			const subpath = source.slice(packageName.length).replace(/^\//, "");
			for (
				let directory = importerDir;
				directory !== dirname(directory);
				directory = dirname(directory)
			) {
				const packageRoot = resolve(directory, "node_modules", packageName);
				bases.push(resolve(packageRoot, subpath));
				bases.push(resolve(packageRoot, "src", subpath));
			}
		}
		for (const base of bases) {
			const candidates = [
				...this.extensions.map((extension) => `${base}${extension}`),
				`${base}/index.ts`,
				`${base}/index.tsx`,
			];
			for (const candidate of candidates) {
				try {
					if (statSync(candidate).isFile()) return candidate;
				} catch {
					// Try the next bundler-compatible candidate.
				}
			}
		}
		return undefined;
	}
}
