import type { PandaMigrateOptions, PandaMigrateReport } from "./panda-migrate.ts";
import { runPandaMigration } from "./panda-migrate.ts";

/** Scoped Panda migration domain; concrete parsing/emission modules stay replaceable. */
export const PANDA_MIGRATION_PIPELINE_SCHEMA = "pandwind.panda-migration-pipeline/1" as const;

export interface PandaMigrationStage {
	readonly id: string;
	run(options: PandaMigrateOptions): Promise<PandaMigrateReport>;
}

export interface PandaMigrationPipeline {
	readonly schema: typeof PANDA_MIGRATION_PIPELINE_SCHEMA;
	readonly stages: readonly PandaMigrationStage[];
	run(options: PandaMigrateOptions): Promise<PandaMigrateReport>;
}

export function createPandaMigrationPipeline(
	stages: readonly PandaMigrationStage[] = [{ id: "panda-project", run: runPandaMigration }],
): PandaMigrationPipeline {
	return {
		schema: PANDA_MIGRATION_PIPELINE_SCHEMA,
		stages,
		async run(options) {
			const stage = stages[0];
			if (stage === undefined) throw new Error("Panda migration pipeline has no stages");
			return stage.run(options);
		},
	};
}

export const PANDA_MIGRATION_PIPELINE = createPandaMigrationPipeline();
