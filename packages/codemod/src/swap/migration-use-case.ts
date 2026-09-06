import {
	runAdapterMigration,
	runAdapterMigrationAsync,
	type AdapterMigrationOptions,
	type AdapterMigrationResult,
} from "./adapter-migration.ts";

/** Versioned application boundary for one source-file style migration. */
export const STYLE_MIGRATION_USE_CASE_SCHEMA = "pandwind.style-migration-use-case/1" as const;

export interface StyleMigrationExecutor {
	run(source: string, options: AdapterMigrationOptions): AdapterMigrationResult;
	runAsync(source: string, options: AdapterMigrationOptions): Promise<AdapterMigrationResult>;
}

export interface StyleMigrationUseCase extends StyleMigrationExecutor {
	readonly schema: typeof STYLE_MIGRATION_USE_CASE_SCHEMA;
}

const DEFAULT_EXECUTOR: StyleMigrationExecutor = {
	run: runAdapterMigration,
	runAsync: runAdapterMigrationAsync,
};

/**
 * Compose the migration application service from an executor port.
 *
 * The default executor is the built-in adapter runner. Tests, browser hosts,
 * and future project runners can substitute the port without changing the
 * callers that orchestrate a migration.
 */
export function createStyleMigrationUseCase(
	executor: StyleMigrationExecutor = DEFAULT_EXECUTOR,
): StyleMigrationUseCase {
	return {
		schema: STYLE_MIGRATION_USE_CASE_SCHEMA,
		run: (source, options) => executor.run(source, options),
		runAsync: (source, options) => executor.runAsync(source, options),
	};
}

export const STYLE_MIGRATION_USE_CASE = createStyleMigrationUseCase();
