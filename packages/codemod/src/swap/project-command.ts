import type { PandwindMeta } from "../meta.ts";

/** Port for project-wide migrations that need more than one source match. */
export interface ProjectMigrationContext {
	readonly patterns: readonly string[];
	readonly filePaths: readonly string[];
	readonly meta: PandwindMeta;
	readonly outDir?: string;
	readonly force?: boolean;
	readonly diff: boolean;
	readonly report: boolean;
	readonly write: boolean;
	readonly skipMarker: string;
}

export interface ProjectMigrationCommand {
	readonly id: string;
	run(context: ProjectMigrationContext): Promise<void>;
}
