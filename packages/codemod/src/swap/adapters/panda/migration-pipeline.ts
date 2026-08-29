import type { PandaMigrateOptions, PandaMigrateReport } from "./panda-migrate.ts";
import type { PandaMigrationWorkspace } from "./migration-discovery.ts";
import type { PandaCall } from "./parse.ts";
import type { StyleProgram } from "../../semantic-ir.ts";
import {
	PandaMigrationPhase,
	PandaMigrationStageId,
	PandaRewriteCandidateKind,
} from "../../identifiers.ts";
import {
	createPandaMigrationServices,
	type PandaMigrationServiceOverrides,
	type PandaMigrationServices,
} from "./pipeline-services.ts";
import {
	createPandaMigrationStages,
	type PandaMigrationStageFactory,
} from "./migration-stage-factory.ts";

/** Scoped Panda migration domain; concrete parsing/emission modules stay replaceable. */
export const PANDA_MIGRATION_PIPELINE_SCHEMA = "pandwind.panda-migration-pipeline/2" as const;

export interface PandaMigrationContext {
	readonly options: PandaMigrateOptions;
	readonly workspace?: PandaMigrationWorkspace;
	readonly report?: PandaMigrateReport;
	readonly completedStages: readonly string[];
	readonly artifacts?: PandaMigrationArtifacts;
}

export interface PandaMigrationArtifacts {
	readonly calls: readonly PandaCall[];
	readonly programs: readonly StyleProgram[];
	readonly modulePlans: readonly string[];
	readonly rewriteCandidates: readonly {
		file: string;
		start: number;
		end: number;
		kind: PandaRewriteCandidateKind;
	}[];
	readonly validationCandidates: readonly string[];
}

export interface PandaMigrationStageResult {
	readonly workspace?: PandaMigrationWorkspace;
	readonly report?: PandaMigrateReport;
	readonly notes?: readonly string[];
	readonly artifacts?: PandaMigrationArtifacts;
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

export interface PandaMigrationPipelineOptions {
	readonly stages?: readonly PandaMigrationStage[];
	readonly stageFactory?: PandaMigrationStageFactory;
	readonly services?: PandaMigrationServiceOverrides;
}

export function createPandaMigrationPipeline(
	options: PandaMigrationPipelineOptions = {},
): PandaMigrationPipeline {
	const services: PandaMigrationServices = createPandaMigrationServices(options.services);
	const stages =
		options.stages ??
		(options.stageFactory ?? { create: createPandaMigrationStages }).create(services);
	return {
		schema: PANDA_MIGRATION_PIPELINE_SCHEMA,
		stages,
		async run(migrationOptions) {
			let context: PandaMigrationContext = { options: migrationOptions, completedStages: [] };
			for (const stage of stages) {
				// Stages are sequential by contract: each stage consumes prior context.
				// oxlint-disable-next-line no-await-in-loop
				const result = await stage.run(context);
				context = {
					...context,
					...result,
					completedStages: [...context.completedStages, stage.id],
				};
			}
			if (context.report === undefined)
				throw new Error(
					`Panda migration pipeline produced no ${PandaMigrationStageId.ValidationReporting} report`,
				);
			return context.report;
		},
	};
}

export const PANDA_MIGRATION_PIPELINE = createPandaMigrationPipeline();
