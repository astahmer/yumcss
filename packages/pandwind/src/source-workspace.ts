import { globSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
	SOURCE_SCANNER_SERVICE,
	type SourceDocument,
	type SourceScanResult,
	type SourceScannerService,
} from "./source-scanner.ts";

/** Node-side source workspace protocol shared by analysis and migration hosts. */
export const SOURCE_WORKSPACE_SCHEMA = "pandwind.source-workspace/1" as const;

export interface SourceWorkspaceFile {
	readonly path: string;
	readonly source: string;
	/** Provider timestamp used by incremental consumers when available. */
	readonly mtimeMs?: number;
	readonly document: SourceDocument;
	readonly scan: SourceScanResult;
}

export interface SourceWorkspaceQuery {
	/** Include regular files whose language is not supported by source scanning. */
	readonly includeUnsupported?: boolean;
}

export interface SourceWorkspaceGlobOptions {
	readonly cwd: string;
	readonly exclude?: (entry: string) => boolean;
}

/** Filesystem boundary used by the node workspace implementation. */
export interface SourceWorkspaceFileSystem {
	readFile(path: string): string;
	stat(path: string): {
		readonly isFile: () => boolean;
		readonly isDirectory: () => boolean;
		readonly mtimeMs?: number;
	};
	glob(pattern: string, options: SourceWorkspaceGlobOptions): readonly string[];
}

export interface SourceWorkspaceOptions {
	readonly fileSystem?: SourceWorkspaceFileSystem;
	readonly scanner?: SourceScannerService;
}

export interface SourceWorkspace {
	readonly schema: typeof SOURCE_WORKSPACE_SCHEMA;
	files(patterns: readonly string[], root: string, query?: SourceWorkspaceQuery): readonly string[];
	read(paths: readonly string[]): readonly SourceWorkspaceFile[];
	collect(patterns: readonly string[], root: string): readonly SourceWorkspaceFile[];
}

const isIgnoredPath = (file: string): boolean =>
	file.split(/[\\/]/).some((segment) => segment === "node_modules" || segment === ".git");

const nodeFileSystem: SourceWorkspaceFileSystem = {
	readFile: (path) => readFileSync(path, "utf8"),
	stat: (path) => statSync(path),
	glob: (pattern, options) =>
		globSync(pattern, {
			cwd: options.cwd,
			exclude: options.exclude,
		}).filter((entry): entry is string => typeof entry === "string"),
};

class NodeSourceWorkspace implements SourceWorkspace {
	readonly schema = SOURCE_WORKSPACE_SCHEMA;
	private readonly fileSystem: SourceWorkspaceFileSystem;
	private readonly scanner: SourceScannerService;

	constructor(options: SourceWorkspaceOptions = {}) {
		this.fileSystem = options.fileSystem ?? nodeFileSystem;
		this.scanner = options.scanner ?? SOURCE_SCANNER_SERVICE;
	}

	private expandPattern(pattern: string, root: string): readonly string[] {
		const absolute = resolve(root, pattern);
		try {
			const stat = this.fileSystem.stat(absolute);
			if (stat.isFile()) return [absolute];
			if (stat.isDirectory())
				return this.fileSystem
					.glob("**/*", {
						cwd: absolute,
						exclude: (entry) => {
							try {
								return this.fileSystem.stat(resolve(absolute, entry)).isDirectory();
							} catch {
								return true;
							}
						},
					})
					.map((entry) => resolve(absolute, entry));
		} catch {
			// A non-literal path is intentionally treated as a glob below.
		}
		return this.fileSystem.glob(pattern, { cwd: root }).map((entry) => resolve(root, entry));
	}

	files(
		patterns: readonly string[],
		root: string,
		query: SourceWorkspaceQuery = {},
	): readonly string[] {
		const files = new Set<string>();
		for (const pattern of patterns)
			for (const file of this.expandPattern(pattern, root)) {
				if (isIgnoredPath(file)) continue;
				try {
					if (
						this.fileSystem.stat(file).isFile() &&
						(query.includeUnsupported === true || this.scanner.isSupportedFile(file))
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
				const source = this.fileSystem.readFile(path);
				const mtimeMs = this.fileSystem.stat(path).mtimeMs;
				const document = { file: path, source } satisfies SourceDocument;
				files.push({ path, source, mtimeMs, document, scan: this.scanner.scan(document) });
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

export const createSourceWorkspace = (options: SourceWorkspaceOptions = {}): SourceWorkspace =>
	new NodeSourceWorkspace(options);
