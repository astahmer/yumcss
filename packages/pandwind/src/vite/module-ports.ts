import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

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
	constructor(private readonly extensions = ["", ".ts", ".tsx", ".js", ".jsx"] as const) {}

	resolve(source: string, importerDir: string): string | undefined {
		if (!source.startsWith(".") && !source.startsWith("/")) return undefined;
		const base = resolve(importerDir, source);
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
		return undefined;
	}
}
