import type { AdapterMigrationOptions, AdapterMigrationResult } from "./external-adapters.ts";
import { runAdapterMigration } from "./adapter-migration.ts";
import { MigrationStageId } from "./identifiers.ts";

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
}

/**
 * A scoped pipeline domain leaves the legacy adapter implementations free to
 * evolve independently. New migration policies can add a stage or construct a
 * fresh pipeline without editing every concrete adapter.
 */
export function createAdapterMigrationPipeline(
	stages: readonly MigrationStage<AdapterMigrationInput, AdapterMigrationResult>[] = [
		{
			id: MigrationStageId.AdapterMigration,
			run: ({ source, options }) => runAdapterMigration(source, options),
		},
	],
): AdapterMigrationPipeline {
	return {
		schema: MIGRATION_PIPELINE_SCHEMA,
		stages,
		run(source, options) {
			const stage = stages[0];
			if (stage === undefined) throw new Error("adapter migration pipeline has no stages");
			return stage.run({ source, options });
		},
	};
}

export const ADAPTER_MIGRATION_PIPELINE = createAdapterMigrationPipeline();
