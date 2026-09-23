import { statSync, watch, type FSWatcher } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import {
	createSourceWorkspace,
	type SourceWorkspace,
	type SourceWorkspaceFile,
} from "pandwind/source/workspace";
import {
	SOURCE_SCANNER_SERVICE,
	type SourceDocument,
	type SourceScanResult,
	type SourceScannerService,
} from "pandwind/source";
import type {
	MigrationPreviewDocument,
	MigrationPreviewEditRequest,
	MigrationPreviewOpenRequest,
	MigrationPreviewWorkspacePort,
	MigrationPreviewWorkspaceSnapshot,
} from "./contracts.ts";

export interface MigrationPreviewWorkspaceWatcher {
	watch(root: string, onChange: (file: string) => void): () => void;
}

export interface MigrationPreviewWorkspaceOptions {
	readonly sourceWorkspace?: SourceWorkspace;
	readonly scanner?: SourceScannerService;
	readonly watcher?: MigrationPreviewWorkspaceWatcher;
	readonly defaultPatterns?: readonly string[];
	readonly exclude?: (file: string) => boolean;
}

const DEFAULT_PATTERNS = ["**/*"] as const;
const DEFAULT_GENERATED_DIRECTORIES = new Set([
	".astro",
	".next",
	".svelte-kit",
	".turbo",
	"build",
	"coverage",
	"dist",
	"storybook-static",
]);

const excludeGeneratedPath = (file: string): boolean =>
	file.split(/[\\/]/).some((segment) => DEFAULT_GENERATED_DIRECTORIES.has(segment));

const nodeWatcher: MigrationPreviewWorkspaceWatcher = {
	watch(root, onChange) {
		let handle: FSWatcher | undefined;
		try {
			handle = watch(root, { recursive: true }, (_event, file) => {
				if (typeof file !== "string" || file.length === 0) return;
				onChange(resolve(root, file));
			});
		} catch {
			// Recursive watching is not available on every Node platform. The
			// workspace remains usable; callers can provide a platform watcher.
		}
		return () => handle?.close();
	},
};

const isInside = (root: string, file: string): boolean => {
	const path = relative(root, file);
	return path === "" || (!path.startsWith("..") && !isAbsolute(path));
};

const documentFrom = (
	file: SourceWorkspaceFile,
	source: string,
	scanner: SourceScannerService,
): MigrationPreviewDocument => {
	if (source === file.source) return { document: file.document, scan: file.scan };
	const document: SourceDocument = { ...file.document, source };
	const scan: SourceScanResult = scanner.scan(document);
	return { document, scan };
};

class DefaultMigrationPreviewWorkspace implements MigrationPreviewWorkspacePort {
	private readonly sourceWorkspace: SourceWorkspace;
	private readonly scanner: SourceScannerService;
	private root: string | null = null;
	private patterns: readonly string[] = DEFAULT_PATTERNS;
	private revision = 0;
	private files: readonly SourceWorkspaceFile[] = [];
	private readonly overlays = new Map<string, string>();
	private readonly overlayBases = new Map<string, string>();
	private conflicts = new Set<string>();
	private readonly listeners = new Set<(workspace: MigrationPreviewWorkspaceSnapshot) => void>();
	private stopWatching: (() => void) | undefined;

	constructor(private readonly options: MigrationPreviewWorkspaceOptions) {
		this.sourceWorkspace = options.sourceWorkspace ?? createSourceWorkspace();
		this.scanner = options.scanner ?? SOURCE_SCANNER_SERVICE;
	}

	async open(request: MigrationPreviewOpenRequest): Promise<MigrationPreviewWorkspaceSnapshot> {
		const root = resolve(request.root);
		if (!statSync(root).isDirectory())
			throw new Error(`Migration Preview root is not a directory: ${root}`);
		this.stopWatching?.();
		this.stopWatching = undefined;
		this.root = root;
		this.patterns = request.patterns ?? this.options.defaultPatterns ?? DEFAULT_PATTERNS;
		this.overlays.clear();
		this.overlayBases.clear();
		this.conflicts.clear();
		this.refresh();
		this.stopWatching = (this.options.watcher ?? nodeWatcher).watch(root, (file) => {
			if (!isInside(root, resolve(file))) return;
			this.sourceWorkspace.invalidate(resolve(file));
			this.refresh();
		});
		return this.snapshot();
	}

	async edit(request: MigrationPreviewEditRequest): Promise<MigrationPreviewWorkspaceSnapshot> {
		if (this.root === null)
			throw new Error("Migration Preview workspace must be opened before it can be edited");
		const file = resolve(this.root, request.file);
		if (!isInside(this.root, file))
			throw new Error(`Migration Preview edit is outside the workspace: ${request.file}`);
		if (!this.files.some((entry) => entry.path === file))
			throw new Error(
				`Migration Preview edit target is not an opened source document: ${request.file}`,
			);
		if (!this.overlayBases.has(file))
			this.overlayBases.set(file, this.files.find((entry) => entry.path === file)!.source);
		this.overlays.set(file, request.source);
		this.revision += 1;
		this.notify();
		return this.snapshot();
	}

	subscribe(listener: (workspace: MigrationPreviewWorkspaceSnapshot) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	async close(): Promise<void> {
		this.stopWatching?.();
		this.stopWatching = undefined;
		this.listeners.clear();
		this.overlays.clear();
		this.overlayBases.clear();
		this.conflicts.clear();
		this.files = [];
		this.root = null;
	}

	private refresh(): void {
		if (this.root === null) return;
		this.files = this.sourceWorkspace.collect(this.patterns, this.root, {
			exclude: this.options.exclude ?? excludeGeneratedPath,
		});
		const present = new Set(this.files.map((file) => file.path));
		for (const file of this.files) {
			const overlay = this.overlays.get(file.path);
			const base = this.overlayBases.get(file.path);
			if (
				overlay !== undefined &&
				base !== undefined &&
				file.source !== base &&
				file.source !== overlay
			)
				this.conflicts.add(file.path);
			else if (file.source === overlay) this.conflicts.delete(file.path);
		}
		for (const file of this.conflicts) if (!present.has(file)) this.conflicts.delete(file);
		this.revision += 1;
		this.notify();
	}

	private snapshot(): MigrationPreviewWorkspaceSnapshot {
		if (this.root === null) throw new Error("Migration Preview workspace has not been opened");
		return {
			revision: this.revision,
			root: this.root,
			files: this.files.map((file) =>
				documentFrom(file, this.overlays.get(file.path) ?? file.source, this.scanner),
			),
			...(this.conflicts.size === 0 ? {} : { conflicts: [...this.conflicts].toSorted() }),
		};
	}

	private notify(): void {
		if (this.root === null) return;
		const snapshot = this.snapshot();
		for (const listener of this.listeners) listener(snapshot);
	}
}

export const createMigrationPreviewWorkspace = (
	options: MigrationPreviewWorkspaceOptions = {},
): MigrationPreviewWorkspacePort => new DefaultMigrationPreviewWorkspace(options);
