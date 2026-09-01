/**
 * Panda adapter boundary. The rest of codemod only depends on this facade;
 * Panda's parser, project model, staged migration, and module emitters stay
 * owned by this adapter family.
 */
export { runPandaMigration } from "./panda-migrate.ts";
export type { PandaMigrateOptions, PandaMigrateReport } from "./panda-migrate.ts";
export {
	PANDA_MIGRATION_PIPELINE,
	PANDA_MIGRATION_PIPELINE_SCHEMA,
	createPandaMigrationPipeline,
} from "./migration-pipeline.ts";
export type {
	PandaMigrationContext,
	PandaMigrationPipeline,
	PandaMigrationStageResult,
	PandaMigrationArtifacts,
} from "./migration-pipeline.ts";
export {
	PANDA_DISCOVERY_SCHEMA,
	discoverPandaFiles,
	discoverPandaMigration,
	extractPandaMigrationUsage,
	loadPandaMigrationTheme,
	scanPandaMigrationSources,
} from "./migration-discovery.ts";
export type {
	PandaMigrationFile,
	PandaMigrationSource,
	PandaMigrationWorkspace,
} from "./migration-discovery.ts";
export {
	PANDA_MIGRATION_STAGES_SCHEMA,
	convertPandaRecipe,
	convertPandaStyle,
	emitPandaStyle,
	rewritePandaSource,
	validatePandaSource,
} from "./migration-stages.ts";
