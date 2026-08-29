import { globSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { SourceDocument } from "./source-scanner.ts";

/** Versioned filesystem boundary for source-consuming lanes. */
export const SOURCE_WORKSPACE_SCHEMA = "pandwind.source-workspace/1" as const;

export interface SourceWorkspaceQuery {
	readonly root: string;
	readonly patterns: readonly string[];
}

export interface SourceWorkspace {
	readonly schema: typeof SOURCE_WORKSPACE_SCHEMA;
	/** Resolve paths only; language and parser policy belong to SourceScanner. */
	files(query: SourceWorkspaceQuery): readonly string[];
	read(file: string, root?: string): SourceDocument;
	documents(query: SourceWorkspaceQuery): readonly SourceDocument[];
}

export interface SourceWorkspaceDependencies {
	readonly glob?: (pattern: string, options: { cwd: string }) => readonly string[];
	readonly readFile?: (file: string) => string;
	readonly isFile?: (file: string) => boolean;
}

const defaultGlob = (pattern: string, options: { cwd: string }): readonly string[] =>
	globSync(pattern, { cwd: options.cwd }) as readonly string[];

const defaultReadFile = (file: string): string => readFileSync(file, "utf8");

const defaultIsFile = (file: string): boolean => {
	try {
		return statSync(file).isFile();
	} catch {
		return false;
	}
};

class NodeSourceWorkspace implements SourceWorkspace {
	readonly schema = SOURCE_WORKSPACE_SCHEMA;
	private readonly glob: NonNullable<SourceWorkspaceDependencies["glob"]>;
	private readonly readFile: NonNullable<SourceWorkspaceDependencies["readFile"]>;
	private readonly isFile: NonNullable<SourceWorkspaceDependencies["isFile"]>;

	constructor(dependencies: SourceWorkspaceDependencies = {}) {
		this.glob = dependencies.glob ?? defaultGlob;
		this.readFile = dependencies.readFile ?? defaultReadFile;
		this.isFile = dependencies.isFile ?? defaultIsFile;
	}

	files(query: SourceWorkspaceQuery): readonly string[] {
		const files = new Set<string>();
		for (const pattern of query.patterns) {
			for (const candidate of this.glob(pattern, { cwd: query.root })) {
				const file = isAbsolute(candidate) ? candidate : resolve(query.root, candidate);
				if (!file.includes("/node_modules/") && this.isFile(file)) files.add(file);
			}
		}
		return [...files].toSorted();
	}

	read(file: string, root?: string): SourceDocument {
		return {
			file,
			source: this.readFile(file),
			...(root === undefined ? {} : { root }),
		};
	}

	documents(query: SourceWorkspaceQuery): readonly SourceDocument[] {
		return this.files(query).map((file) => this.read(file, query.root));
	}
}

export const createSourceWorkspace = (
	dependencies: SourceWorkspaceDependencies = {},
): SourceWorkspace => new NodeSourceWorkspace(dependencies);

