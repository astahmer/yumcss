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
	StudioDocument,
	StudioEditRequest,
	StudioOpenRequest,
	StudioWorkspacePort,
	StudioWorkspaceSnapshot,
} from "./contracts.ts";

export interface StudioWorkspaceWatcher {
	watch(root: string, onChange: (file: string) => void): () => void;
}

export interface StudioWorkspaceOptions {
	readonly sourceWorkspace?: SourceWorkspace;
	readonly scanner?: SourceScannerService;
	readonly watcher?: StudioWorkspaceWatcher;
	readonly defaultPatterns?: readonly string[];
}

const DEFAULT_PATTERNS = ["**/*"] as const;

const nodeWatcher: StudioWorkspaceWatcher = {
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
): StudioDocument => {
	if (source === file.source) return { document: file.document, scan: file.scan };
	const document: SourceDocument = { ...file.document, source };
	const scan: SourceScanResult = scanner.scan(document);
	return { document, scan };
};

class DefaultStudioWorkspace implements StudioWorkspacePort {
	private readonly sourceWorkspace: SourceWorkspace;
	private readonly scanner: SourceScannerService;
	private root: string | null = null;
	private patterns: readonly string[] = DEFAULT_PATTERNS;
	private revision = 0;
	private files: readonly SourceWorkspaceFile[] = [];
	private readonly overlays = new Map<string, string>();
	private readonly listeners = new Set<(workspace: StudioWorkspaceSnapshot) => void>();
	private stopWatching: (() => void) | undefined;

	constructor(private readonly options: StudioWorkspaceOptions) {
		this.sourceWorkspace = options.sourceWorkspace ?? createSourceWorkspace();
		this.scanner = options.scanner ?? SOURCE_SCANNER_SERVICE;
	}

	async open(request: StudioOpenRequest): Promise<StudioWorkspaceSnapshot> {
		const root = resolve(request.root);
		if (!statSync(root).isDirectory()) throw new Error(`studio root is not a directory: ${root}`);
		this.stopWatching?.();
		this.stopWatching = undefined;
		this.root = root;
		this.patterns = request.patterns ?? this.options.defaultPatterns ?? DEFAULT_PATTERNS;
		this.overlays.clear();
		this.refresh();
		this.stopWatching = (this.options.watcher ?? nodeWatcher).watch(root, (file) => {
			if (!isInside(root, resolve(file))) return;
			this.sourceWorkspace.invalidate(resolve(file));
			this.refresh();
		});
		return this.snapshot();
	}

	async edit(request: StudioEditRequest): Promise<StudioWorkspaceSnapshot> {
		if (this.root === null)
			throw new Error("studio workspace must be opened before it can be edited");
		const file = resolve(this.root, request.file);
		if (!isInside(this.root, file))
			throw new Error(`studio edit is outside the workspace: ${request.file}`);
		if (!this.files.some((entry) => entry.path === file))
			throw new Error(`studio edit target is not an opened source document: ${request.file}`);
		this.overlays.set(file, request.source);
		this.revision += 1;
		this.notify();
		return this.snapshot();
	}

	subscribe(listener: (workspace: StudioWorkspaceSnapshot) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	async close(): Promise<void> {
		this.stopWatching?.();
		this.stopWatching = undefined;
		this.listeners.clear();
		this.overlays.clear();
		this.files = [];
		this.root = null;
	}

	private refresh(): void {
		if (this.root === null) return;
		this.files = this.sourceWorkspace.collect(this.patterns, this.root);
		this.revision += 1;
		this.notify();
	}

	private snapshot(): StudioWorkspaceSnapshot {
		if (this.root === null) throw new Error("studio workspace has not been opened");
		return {
			revision: this.revision,
			root: this.root,
			files: this.files.map((file) =>
				documentFrom(file, this.overlays.get(file.path) ?? file.source, this.scanner),
			),
		};
	}

	private notify(): void {
		if (this.root === null) return;
		const snapshot = this.snapshot();
		for (const listener of this.listeners) listener(snapshot);
	}
}

export const createStudioWorkspace = (options: StudioWorkspaceOptions = {}): StudioWorkspacePort =>
	new DefaultStudioWorkspace(options);

export const createNodeStudioWorkspace = (): StudioWorkspacePort => createStudioWorkspace();
