import type { AdapterMigrationOptions, AdapterMigrationResult } from "./adapter-migration.ts";
import { MigrationStageId } from "./identifiers.ts";
import { STYLE_MIGRATION_USE_CASE, type StyleMigrationUseCase } from "./migration-use-case.ts";

/** Versioned orchestration boundary for source/target adapter migrations. */
export const MIGRATION_PIPELINE_SCHEMA = "pandwind.migration-pipeline/1" as const;

export interface AdapterMigrationInput {
	readonly source: string;
	readonly options: AdapterMigrationOptions;
}

export interface MigrationStage<TContext, TResult> {
	readonly id: string;
	run(context: TContext): TResult;
}

export interface AdapterMigrationPipeline {
	readonly schema: typeof MIGRATION_PIPELINE_SCHEMA;
	readonly stages: readonly MigrationStage<AdapterMigrationInput, AdapterMigrationResult>[];
	run(source: string, options: AdapterMigrationOptions): AdapterMigrationResult;
	runAsync(source: string, options: AdapterMigrationOptions): Promise<AdapterMigrationResult>;
}

/**
 * A scoped pipeline domain leaves concrete adapter implementations free to
 * evolve independently. New migration policies can add a stage or construct a
 * fresh pipeline without editing every concrete adapter.
 */
export function createAdapterMigrationPipeline(
	stages:
		| readonly MigrationStage<AdapterMigrationInput, AdapterMigrationResult>[]
		| undefined = undefined,
	useCase: StyleMigrationUseCase = STYLE_MIGRATION_USE_CASE,
): AdapterMigrationPipeline {
	const pipelineStages = stages ?? [
		{
			id: MigrationStageId.AdapterMigration,
			run: ({ source, options }) => useCase.run(source, options),
		},
	];
	return {
		schema: MIGRATION_PIPELINE_SCHEMA,
		stages: pipelineStages,
		run(source, options) {
			const stage = pipelineStages[0];
			if (stage === undefined) throw new Error("adapter migration pipeline has no stages");
			return stage.run({ source, options });
		},
		runAsync(source, options) {
			return useCase.runAsync(source, options);
		},
	};
}

export const ADAPTER_MIGRATION_PIPELINE = createAdapterMigrationPipeline();
