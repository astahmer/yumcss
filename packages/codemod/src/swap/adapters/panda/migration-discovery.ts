/** Independently testable Panda migration discovery stage. */
import { resolve } from "node:path";
import { SOURCE_SCANNER_SERVICE, type SourceScanResult } from "pandwind/source";
import { createSourceWorkspace } from "pandwind/source/workspace";
import type { PandaMigrateOptions } from "./panda-migrate.ts";
import { detectAlias, scanProjectUsage, type AliasInfo, type ProjectUsage } from "./project.ts";
import { emptyPandaTheme, loadPandaTheme, type PandaTheme } from "./theme.ts";

export const PANDA_DISCOVERY_SCHEMA = "pandwind.panda-discovery/2" as const;

export interface PandaMigrationFile {
	readonly path: string;
	readonly source: string;
}

export interface PandaMigrationSource {
	readonly path: string;
	readonly scan: SourceScanResult;
}

export interface PandaMigrationWorkspace {
	readonly schema: typeof PANDA_DISCOVERY_SCHEMA;
	readonly files: readonly PandaMigrationFile[];
	readonly aliasInfo: AliasInfo;
	readonly theme: PandaTheme;
	readonly usage: ProjectUsage;
	readonly sources: readonly PandaMigrationSource[];
	readonly outDir: string;
	readonly notes: readonly string[];
}

/** Collect candidate source files without interpreting Panda syntax. */
export function discoverPandaFiles(
	projectRoot: string,
	patterns: readonly string[],
): PandaMigrationFile[] {
	return createSourceWorkspace()
		.collect(patterns, projectRoot)
		.map(({ path, source }) => ({ path, source }));
}

/** Load only the project theme/config layer; failures intentionally degrade to an empty theme. */
export async function loadPandaMigrationTheme(projectRoot: string): Promise<PandaTheme> {
	const candidate = createSourceWorkspace()
		.read(
			["panda.config.ts", "panda.config.mjs", "panda.config.js"].map((name) =>
				resolve(projectRoot, name),
			),
		)
		.at(0)?.path;
	if (candidate === undefined) return emptyPandaTheme;
	try {
		return await loadPandaTheme(candidate);
	} catch {
		return emptyPandaTheme;
	}
}

/** Scan source documents through the shared language/framework scanner. */
export function scanPandaMigrationSources(
	files: readonly PandaMigrationFile[],
): readonly PandaMigrationSource[] {
	return files.map((file) => ({
		path: file.path,
		scan: SOURCE_SCANNER_SERVICE.scan({ file: file.path, source: file.source }),
	}));
}

/** Extract project-level Panda usage after source discovery and theme loading. */
export function extractPandaMigrationUsage(files: readonly PandaMigrationFile[]): ProjectUsage {
	return scanProjectUsage(files);
}

/** Collect source files and project semantics without performing any writes. */
export async function discoverPandaMigration(
	options: Pick<PandaMigrateOptions, "projectRoot" | "patterns" | "outDirName">,
): Promise<PandaMigrationWorkspace> {
	const files = discoverPandaFiles(options.projectRoot, options.patterns);
	const aliasInfo = detectAlias(options.projectRoot);
	const theme = await loadPandaMigrationTheme(options.projectRoot);
	const sources = scanPandaMigrationSources(files);
	const usage = extractPandaMigrationUsage(files);
	const outDirName = options.outDirName || "pandwind";
	return {
		schema: PANDA_DISCOVERY_SCHEMA,
		files,
		aliasInfo,
		theme,
		usage,
		sources,
		outDir: resolve(options.projectRoot, aliasInfo.targetRoot, outDirName),
		notes: [
			`alias: ${aliasInfo.alias || "(relative imports)"} (${aliasInfo.source})`,
			`theme tokens: ${theme.tokenVars.size}, textStyles: ${theme.textStyles.size}`,
		],
	};
}
