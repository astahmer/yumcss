/**
 * Panda adapter boundary. The rest of codemod only depends on this facade;
 * Panda's parser, project model, staged migration, and module emitters stay
 * owned by this adapter family.
 */
export { runPandaMigration, inferCommonRoot } from "./panda-migrate.ts";
export type { PandaMigrateOptions, PandaMigrateReport } from "./panda-migrate.ts";
export { PandaFactoryAdapter } from "./factory-adapter.ts";
export {
	PANDA_MIGRATION_PIPELINE,
	PANDA_MIGRATION_PIPELINE_SCHEMA,
	createPandaMigrationPipeline,
} from "./migration-pipeline.ts";
export type {
	PandaMigrationContext,
	PandaMigrationPipeline,
	PandaMigrationPipelineOptions,
	PandaMigrationStage,
	PandaMigrationStageResult,
	PandaMigrationArtifacts,
} from "./migration-pipeline.ts";
export {
	DEFAULT_PANDA_MIGRATION_STAGE_FACTORY,
	createPandaMigrationStages,
} from "./migration-stage-factory.ts";
export type { PandaMigrationStageFactory } from "./migration-stage-factory.ts";
export { createPandaMigrationServices } from "./pipeline-services.ts";
export type {
	PandaMigrationServices,
	PandaMigrationServiceOverrides,
} from "./pipeline-services.ts";
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
export { expandBuiltinPattern } from "./patterns.ts";
export { detectAlias } from "./project.ts";
export { loadPandaTheme } from "./theme.ts";
export type { PandaTheme } from "./theme.ts";
export {
	PANDA_ALIASES,
	parsePandaCalls,
	pandaRecipeToIr,
	pandaStyleToIr,
	normalizePandaStyleObject,
	parseObjectLiteral,
} from "./parse.ts";
export type { PandaCall, PandaRecipeIR } from "./parse.ts";
export { foldRecipeCall, renderJsxIndex, renderPatternModule } from "./modules.ts";
