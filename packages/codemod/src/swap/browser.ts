/**
 * Browser-safe migration surface.
 *
 * This entry intentionally omits the CLI, Tailwind engine, and project-aware
 * filesystem orchestration. It still uses the same adapter catalog and
 * migration use case, with callers supplying an in-memory source document.
 */
export {
	createBrowserCodemodCatalog,
	type BrowserCodemodCatalogOptions,
} from "./browser-adapter-catalog.ts";
export { PANDWIND_API_DIALECTS } from "./adapters/core.adapter.ts";
export { runAdapterMigration } from "./adapter-migration.ts";
export type { AdapterMigrationOutcome } from "./adapter-contract.ts";
export { CodemodAdapterId, StyleMigrationOutcome, SwapSourceId } from "./identifiers.ts";
export { BUILTIN_CODEMOD_ADAPTER_IDS } from "./identifiers.ts";
export {
	MIGRATION_ROUTE_PROOF_CATALOG,
	MigrationRouteMaturityTag,
	MigrationRouteProofExecutionTag,
	MigrationRouteProofRouteId,
	findMigrationRouteProof,
} from "./route-proof-catalog.ts";
export type { MigrationRouteProofSpec } from "./route-proof-catalog.ts";
export type { AdapterCapabilityReport } from "./capabilities.ts";
export type {
	AdapterDependencies,
	AdapterValidationResult,
	StyleAdapter,
} from "./adapter-contract.ts";
export { parseTailwindCandidateCss } from "./adapters/tailwind.adapter.ts";
export type { TailwindUtilityResolver } from "./adapters/tailwind.adapter.ts";
export type { StyleDeclaration } from "./semantic-ir.ts";
