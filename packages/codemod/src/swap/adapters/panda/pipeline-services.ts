import type { PandaMigrateOptions, PandaMigrateReport } from "./panda-migrate.ts";
import { runPandaMigration } from "./panda-migrate.ts";
import { PandaFactoryAdapter } from "./factory-adapter.ts";
import {
	discoverPandaMigration,
	extractPandaMigrationUsage,
	loadPandaMigrationTheme,
	scanPandaMigrationSources,
	type PandaMigrationFile,
	type PandaMigrationSource,
	type PandaMigrationWorkspace,
} from "./migration-discovery.ts";
import { parsePandaCalls, type PandaCall } from "./parse.ts";
import type { PandaTheme } from "./theme.ts";
import type { ProjectUsage } from "./project.ts";

export interface PandaMigrationServices {
	discover(
		options: Pick<PandaMigrateOptions, "projectRoot" | "patterns" | "outDirName">,
	): Promise<PandaMigrationWorkspace>;
	loadTheme(projectRoot: string): Promise<PandaTheme>;
	scanSources(files: readonly PandaMigrationFile[]): readonly PandaMigrationSource[];
	extractUsage(files: readonly PandaMigrationFile[]): ProjectUsage;
	parseCalls(
		source: string,
		excluded: (start: number) => boolean,
		options?: { theme?: PandaTheme },
	): readonly PandaCall[];
	factoryAdapter: typeof PandaFactoryAdapter;
	run(options: PandaMigrateOptions): Promise<PandaMigrateReport>;
}

export type PandaMigrationServiceOverrides = Partial<PandaMigrationServices>;

/** Default adapter-family composition; tests and integrations may replace any port. */
export function createPandaMigrationServices(
	overrides: PandaMigrationServiceOverrides = {},
): PandaMigrationServices {
	return {
		discover: discoverPandaMigration,
		loadTheme: loadPandaMigrationTheme,
		scanSources: scanPandaMigrationSources,
		extractUsage: extractPandaMigrationUsage,
		parseCalls: parsePandaCalls,
		factoryAdapter: PandaFactoryAdapter,
		run: runPandaMigration,
		...overrides,
	};
}
