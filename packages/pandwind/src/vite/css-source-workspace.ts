import { readFileSync, statSync } from "node:fs";
import type { CssPreset } from "./css-extract.ts";
import type { CssSourceService } from "./css-source-service.ts";
import { createSourceWorkspace } from "../source-workspace.ts";

interface CssSourceWorkspaceEntry {
	readonly mtimeMs: number;
	readonly sources: ReturnType<CssSourceService["extract"]>;
	readonly varKeys: string[];
}

export interface CssSourceWorkspace {
	files(): string[];
	scan(file: string): CssSourceWorkspaceEntry;
	isFresh(files: string[], cachedFiles: string[]): boolean;
	entries(): ReadonlyMap<string, CssSourceWorkspaceEntry>;
	prune(files: ReadonlySet<string>): void;
	invalidate(file: string): void;
}

export interface CssSourceWorkspaceOptions {
	readonly root: string;
	readonly include: readonly RegExp[];
	readonly exclude: readonly RegExp[];
	readonly matchers: Array<string | RegExp>;
	readonly preset: CssPreset;
	readonly sourceService: CssSourceService;
}

class NodeCssSourceWorkspace implements CssSourceWorkspace {
	private readonly cache = new Map<string, CssSourceWorkspaceEntry>();
	private readonly options: CssSourceWorkspaceOptions;
	private readonly sourceWorkspace = createSourceWorkspace();

	constructor(options: CssSourceWorkspaceOptions) {
		this.options = options;
	}

	private isScanned(file: string): boolean {
		return (
			this.options.include.some((pattern) => pattern.test(file)) &&
			!this.options.exclude.some((pattern) => pattern.test(file))
		);
	}

	files(dir = this.options.root, acc: string[] = []): string[] {
		acc.push(
			...this.sourceWorkspace
				.files(["**/*"], dir, { includeUnsupported: true })
				.filter((path) => this.isScanned(path)),
		);
		return acc;
	}

	scan(file: string): CssSourceWorkspaceEntry {
		const mtimeMs = statSync(file).mtimeMs;
		const cached = this.cache.get(file);
		if (cached?.mtimeMs === mtimeMs) return cached;
		const extracted = this.options.sourceService.extractFile(
			readFileSync(file, "utf8"),
			file,
			this.options.matchers,
			this.options.preset,
		);
		const entry = { mtimeMs, ...extracted };
		this.cache.set(file, entry);
		return entry;
	}

	isFresh(files: string[], cachedFiles: string[]): boolean {
		if (files.length !== cachedFiles.length) return false;
		for (let index = 0; index < files.length; index++) {
			const file = files[index]!;
			if (file !== cachedFiles[index] || this.cache.get(file) === undefined) return false;
			try {
				if (this.cache.get(file)!.mtimeMs !== statSync(file).mtimeMs) return false;
			} catch {
				return false;
			}
		}
		return true;
	}

	entries(): ReadonlyMap<string, CssSourceWorkspaceEntry> {
		return this.cache;
	}

	prune(files: ReadonlySet<string>): void {
		for (const file of this.cache.keys()) if (!files.has(file)) this.cache.delete(file);
	}

	invalidate(file: string): void {
		this.cache.delete(file);
	}
}

export const createCssSourceWorkspace = (options: CssSourceWorkspaceOptions): CssSourceWorkspace =>
	new NodeCssSourceWorkspace(options);
