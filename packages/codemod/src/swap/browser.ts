/**
 * Browser-safe migration surface.
 *
 * This entry intentionally omits the CLI, Tailwind engine, and project-aware
 * filesystem orchestration. It still uses the same adapter catalog and
 * migration use case, with callers supplying an in-memory source document.
 */
export { createBrowserCodemodCatalog as createBuiltinCodemodCatalog } from "./browser-adapter-catalog.ts";
export { PANDWIND_API_DIALECTS } from "./adapters/core.adapter.ts";
export { runAdapterMigration } from "./adapter-migration.ts";
export type { AdapterMigrationOutcome } from "./adapter-migration.ts";
export { CodemodAdapterId, StyleMigrationOutcome, SwapSourceId } from "./identifiers.ts";
export type { AdapterCapabilityReport } from "./capabilities.ts";
export type {
	AdapterDependencies,
	AdapterValidationResult,
	StyleAdapter,
} from "./adapter-contract.ts";
