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
	forEach(paths: readonly string[], visit: (file: SourceWorkspaceFile) => void): void;
	read(paths: readonly string[]): readonly SourceWorkspaceFile[];
	collect(patterns: readonly string[], root: string): readonly SourceWorkspaceFile[];
	/** Notify an incremental consumer that one path may have changed. */
	invalidate(file: string): void;
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

type WorkspaceCache = Map<string, SourceWorkspaceFile>;

/**
 * Default workspaces are short-lived composition objects created by several
 * consumers. Keep their scan result cache outside the object so analyzer,
 * codemod, collection, and bundler paths can reuse an unchanged document.
 * The source itself is part of the key check: mtime is only metadata and is
 * not trusted for correctness when a file changes between reads.
 */
const sharedCaches = new WeakMap<object, WeakMap<object, WorkspaceCache>>();
const SHARED_CACHE_LIMIT = 4096;
const FILE_LIST_CACHE_LIMIT = 32;

function cacheFor(
	fileSystem: SourceWorkspaceFileSystem,
	scanner: SourceScannerService,
): WorkspaceCache {
	let scannerCaches = sharedCaches.get(fileSystem as object);
	if (scannerCaches === undefined) {
		scannerCaches = new WeakMap<object, WorkspaceCache>();
		sharedCaches.set(fileSystem as object, scannerCaches);
	}
	let cache = scannerCaches.get(scanner as object);
	if (cache === undefined) {
		cache = new Map<string, SourceWorkspaceFile>();
		scannerCaches.set(scanner as object, cache);
	}
	return cache;
}

class NodeSourceWorkspace implements SourceWorkspace {
	readonly schema = SOURCE_WORKSPACE_SCHEMA;
	private readonly fileSystem: SourceWorkspaceFileSystem;
	private readonly scanner: SourceScannerService;
	private readonly cache: WorkspaceCache;
	private readonly fileLists = new Map<string, string[]>();
	private readonly invalidated = new Set<string>();
	private incrementalRead = false;

	constructor(options: SourceWorkspaceOptions = {}) {
		this.fileSystem = options.fileSystem ?? nodeFileSystem;
		this.scanner = options.scanner ?? SOURCE_SCANNER_SERVICE;
		this.cache = cacheFor(this.fileSystem, this.scanner);
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
		const key = `${root}\0${patterns.join("\0")}\0${query.includeUnsupported === true ? "all" : "source"}`;
		const cached = this.fileLists.get(key);
		if (cached !== undefined) return cached;
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
		const result = [...files].toSorted();
		if (this.fileLists.size >= FILE_LIST_CACHE_LIMIT)
			this.fileLists.delete(this.fileLists.keys().next().value!);
		this.fileLists.set(key, result);
		return result;
	}

	forEach(paths: readonly string[], visit: (file: SourceWorkspaceFile) => void): void {
		for (const path of paths) {
			try {
				const cached = this.cache.get(path);
				if (cached !== undefined && this.incrementalRead && !this.invalidated.has(path)) {
					visit(cached);
					continue;
				}
				const source = this.fileSystem.readFile(path);
				if (cached?.source === source) {
					this.invalidated.delete(path);
					visit(cached);
					continue;
				}
				const mtimeMs = this.fileSystem.stat(path).mtimeMs;
				const document = { file: path, source } satisfies SourceDocument;
				const entry = { path, source, mtimeMs, document, scan: this.scanner.scan(document) };
				if (this.cache.size >= SHARED_CACHE_LIMIT)
					this.cache.delete(this.cache.keys().next().value!);
				this.cache.set(path, entry);
				this.invalidated.delete(path);
				visit(entry);
			} catch {
				this.invalidated.delete(path);
				// Discovery is best-effort; higher-level reports own omission diagnostics.
			}
		}
		this.incrementalRead = false;
	}

	read(paths: readonly string[]): readonly SourceWorkspaceFile[] {
		const files: SourceWorkspaceFile[] = [];
		this.forEach(paths, (file) => files.push(file));
		return files;
	}

	collect(patterns: readonly string[], root: string): readonly SourceWorkspaceFile[] {
		return this.read(this.files(patterns, root));
	}

	invalidate(file: string): void {
		this.incrementalRead = true;
		this.invalidated.add(file);
		let exists = false;
		try {
			exists = this.fileSystem.stat(file).isFile();
		} catch {
			exists = false;
		}
		let wasDiscovered = false;
		for (const paths of this.fileLists.values()) {
			const index = paths.indexOf(file);
			if (index >= 0) {
				wasDiscovered = true;
				if (!exists) paths.splice(index, 1);
			}
			// A watcher may report a neighboring file after another file was
			// deleted. Validate cached entries without paying for a full glob so
			// deleted sources cannot survive in an incremental stylesheet.
			for (let pathIndex = paths.length - 1; pathIndex >= 0; pathIndex -= 1) {
				try {
					if (!this.fileSystem.stat(paths[pathIndex]!).isFile()) paths.splice(pathIndex, 1);
				} catch {
					paths.splice(pathIndex, 1);
				}
			}
		}
		// A path that was not part of a cached list may be a newly added file.
		// Re-run discovery in that case; existing-file edits keep the list hot.
		if (exists && !wasDiscovered) this.fileLists.clear();
	}
}

export const createSourceWorkspace = (options: SourceWorkspaceOptions = {}): SourceWorkspace =>
	new NodeSourceWorkspace(options);
