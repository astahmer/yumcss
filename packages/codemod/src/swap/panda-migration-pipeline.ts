import type { PandaMigrateOptions, PandaMigrateReport } from "./panda-migrate.ts";
import { runPandaMigration } from "./panda-migrate.ts";
import {
	discoverPandaMigration,
	type PandaMigrationWorkspace,
} from "./panda-migration-discovery.ts";

/** Scoped Panda migration domain; concrete parsing/emission modules stay replaceable. */
export const PANDA_MIGRATION_PIPELINE_SCHEMA = "pandwind.panda-migration-pipeline/2" as const;

export type PandaMigrationPhase =
	| "discovery"
	| "conversion"
	| "emission"
	| "rewrite"
	| "validation";

export interface PandaMigrationContext {
	readonly options: PandaMigrateOptions;
	readonly workspace?: PandaMigrationWorkspace;
	readonly report?: PandaMigrateReport;
}

export interface PandaMigrationStageResult {
	readonly workspace?: PandaMigrationWorkspace;
	readonly report?: PandaMigrateReport;
}

export interface PandaMigrationStage {
	readonly id: string;
	readonly phase: PandaMigrationPhase;
	run(context: PandaMigrationContext): Promise<PandaMigrationStageResult>;
}

export interface PandaMigrationPipeline {
	readonly schema: typeof PANDA_MIGRATION_PIPELINE_SCHEMA;
	readonly stages: readonly PandaMigrationStage[];
	run(options: PandaMigrateOptions): Promise<PandaMigrateReport>;
}

export function createPandaMigrationPipeline(
	stages: readonly PandaMigrationStage[] = [
		{
			id: "discovery",
			phase: "discovery",
			async run({ options }) {
				return { workspace: await discoverPandaMigration(options) };
			},
		},
		{
			id: "project-migration",
			phase: "conversion",
			async run({ options, workspace }) {
				return { report: await runPandaMigration({ ...options, workspace }) };
			},
		},
	],
): PandaMigrationPipeline {
	return {
		schema: PANDA_MIGRATION_PIPELINE_SCHEMA,
		stages,
		async run(options) {
			let context: PandaMigrationContext = { options };
			for (const stage of stages) {
				// Stages are sequential by contract: each stage consumes prior context.
				// oxlint-disable-next-line no-await-in-loop
				context = { ...context, ...(await stage.run(context)) };
			}
			if (context.report === undefined)
				throw new Error("Panda migration pipeline produced no report");
			return context.report;
		},
	};
}

export const PANDA_MIGRATION_PIPELINE = createPandaMigrationPipeline();
