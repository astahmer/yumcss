import { globSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
	SOURCE_SCANNER_SERVICE,
	type SourceDocument,
	type SourceScanResult,
} from "./source-scanner.ts";

/** Node-side source workspace protocol shared by analysis and migration hosts. */
export const SOURCE_WORKSPACE_SCHEMA = "pandwind.source-workspace/1" as const;

export interface SourceWorkspaceFile {
	readonly path: string;
	readonly source: string;
	readonly document: SourceDocument;
	readonly scan: SourceScanResult;
}

export interface SourceWorkspaceQuery {
	/** Include regular files whose language is not supported by source scanning. */
	readonly includeUnsupported?: boolean;
}

export interface SourceWorkspace {
	readonly schema: typeof SOURCE_WORKSPACE_SCHEMA;
	files(patterns: readonly string[], root: string, query?: SourceWorkspaceQuery): readonly string[];
	read(paths: readonly string[]): readonly SourceWorkspaceFile[];
	collect(patterns: readonly string[], root: string): readonly SourceWorkspaceFile[];
}

function expandPattern(pattern: string, root: string): readonly string[] {
	const absolute = resolve(root, pattern);
	try {
		const stat = statSync(absolute);
		if (stat.isFile()) return [absolute];
		if (stat.isDirectory())
			return globSync("**/*", {
				cwd: absolute,
				exclude: (entry) => {
					try {
						return statSync(resolve(absolute, entry)).isDirectory();
					} catch {
						return true;
					}
				},
			})
				.filter((entry): entry is string => typeof entry === "string")
				.map((entry) => resolve(absolute, entry));
	} catch {
		// A non-literal path is intentionally treated as a glob below.
	}
	return globSync(pattern, { cwd: root })
		.filter((entry): entry is string => typeof entry === "string")
		.map((entry) => resolve(root, entry));
}

const isIgnoredPath = (file: string): boolean =>
	file.split(/[\\/]/).some((segment) => segment === "node_modules" || segment === ".git");

class NodeSourceWorkspace implements SourceWorkspace {
	readonly schema = SOURCE_WORKSPACE_SCHEMA;

	files(
		patterns: readonly string[],
		root: string,
		query: SourceWorkspaceQuery = {},
	): readonly string[] {
		const files = new Set<string>();
		for (const pattern of patterns)
			for (const file of expandPattern(pattern, root)) {
				if (isIgnoredPath(file)) continue;
				try {
					if (
						statSync(file).isFile() &&
						(query.includeUnsupported === true || SOURCE_SCANNER_SERVICE.isSupportedFile(file))
					)
						files.add(file);
				} catch {
					// Unreadable or concurrently removed entries are omitted consistently.
				}
			}
		return [...files].toSorted();
	}

	read(paths: readonly string[]): readonly SourceWorkspaceFile[] {
		const files: SourceWorkspaceFile[] = [];
		for (const path of paths) {
			try {
				const source = readFileSync(path, "utf8");
				const document = { file: path, source } satisfies SourceDocument;
				files.push({ path, source, document, scan: SOURCE_SCANNER_SERVICE.scan(document) });
			} catch {
				// Discovery is best-effort; higher-level reports own omission diagnostics.
			}
		}
		return files;
	}

	collect(patterns: readonly string[], root: string): readonly SourceWorkspaceFile[] {
		return this.read(this.files(patterns, root));
	}
}

export const createSourceWorkspace = (): SourceWorkspace => new NodeSourceWorkspace();
