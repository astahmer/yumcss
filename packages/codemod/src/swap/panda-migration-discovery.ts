/** Independently testable Panda migration discovery stage. */
import { existsSync, readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { resolve } from "node:path";
import { isScriptSourceFile } from "pandwind/source";
import type { PandaMigrateOptions } from "./panda-migrate.ts";
import {
	detectAlias,
	scanProjectUsage,
	type AliasInfo,
	type ProjectUsage,
} from "./panda-project.ts";
import { emptyPandaTheme, loadPandaTheme, type PandaTheme } from "./panda-theme.ts";

export const PANDA_DISCOVERY_SCHEMA = "pandwind.panda-discovery/1" as const;

export interface PandaMigrationFile {
	readonly path: string;
	readonly source: string;
}

export interface PandaMigrationWorkspace {
	readonly schema: typeof PANDA_DISCOVERY_SCHEMA;
	readonly files: readonly PandaMigrationFile[];
	readonly aliasInfo: AliasInfo;
	readonly theme: PandaTheme;
	readonly usage: ProjectUsage;
	readonly outDir: string;
	readonly notes: readonly string[];
}

function collectFiles(projectRoot: string, patterns: readonly string[]): PandaMigrationFile[] {
	const seen = new Set<string>();
	for (const pattern of patterns) {
		const candidates = existsSync(resolve(projectRoot, pattern))
			? [pattern]
			: globSync(pattern, { cwd: projectRoot });
		for (const candidate of candidates) {
			if (typeof candidate !== "string" || !isScriptSourceFile(candidate)) continue;
			seen.add(resolve(projectRoot, candidate));
		}
	}
	const files: PandaMigrationFile[] = [];
	for (const path of [...seen].toSorted()) {
		try {
			files.push({ path, source: readFileSync(path, "utf8") });
		} catch {
			// Discovery is best-effort; unreadable files are reported by omission.
		}
	}
	return files;
}

async function loadTheme(projectRoot: string): Promise<PandaTheme> {
	const candidate = ["panda.config.ts", "panda.config.mjs", "panda.config.js"]
		.map((name) => resolve(projectRoot, name))
		.find((path) => existsSync(path));
	if (candidate === undefined) return emptyPandaTheme;
	try {
		return await loadPandaTheme(candidate);
	} catch {
		return emptyPandaTheme;
	}
}

/** Collect source files and project semantics without performing any writes. */
export async function discoverPandaMigration(
	options: Pick<PandaMigrateOptions, "projectRoot" | "patterns" | "outDirName">,
): Promise<PandaMigrationWorkspace> {
	const files = collectFiles(options.projectRoot, options.patterns);
	const aliasInfo = detectAlias(options.projectRoot);
	const theme = await loadTheme(options.projectRoot);
	const usage = scanProjectUsage(files);
	const outDirName = options.outDirName || "pandwind";
	return {
		schema: PANDA_DISCOVERY_SCHEMA,
		files,
		aliasInfo,
		theme,
		usage,
		outDir: resolve(options.projectRoot, aliasInfo.targetRoot, outDirName),
		notes: [
			`alias: ${aliasInfo.alias || "(relative imports)"} (${aliasInfo.source})`,
			`theme tokens: ${theme.tokenVars.size}, textStyles: ${theme.textStyles.size}`,
		],
	};
}
