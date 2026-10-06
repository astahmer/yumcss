import { SOURCE_SCANNER_SERVICE } from "yumcss/source";
import { createBrowserCodemodCatalog } from "./browser-adapter-catalog.ts";
import { STYLE_LOWERING_REGISTRY } from "./lowering.ts";
import type { ProjectModuleLoader } from "./project-module-loader.ts";
import type { StyleAdapterRegistry } from "./adapter-registry.ts";
import type {
	AdapterMigrationOptions,
	AdapterMigrationPorts,
	AdapterMigrationResult,
	StyleMigrationImplementation,
	StyleMigrationUseCase,
} from "./adapter-migration-contract.ts";
import { STYLE_MIGRATION_USE_CASE_SCHEMA } from "./adapter-migration-contract.ts";
import { createAdapterMigrationEngine } from "./adapter-migration-engine.ts";

async function resolveNodeAdapterRegistry(
	moduleLoader?: ProjectModuleLoader,
): Promise<StyleAdapterRegistry> {
	// Keep this lazy so the browser catalog never pulls Node module loading into
	// the playground. The built package must resolve the emitted JavaScript
	// sibling; importing the source `.ts` path only works before publication.
	const { createBuiltinCodemodCatalog } = await import(/* @vite-ignore */ "./adapter-catalog.js");
	return createBuiltinCodemodCatalog(moduleLoader).registry;
}

const DEFAULT_ADAPTER_MIGRATION_PORTS: AdapterMigrationPorts = {
	adapterRegistry: createBrowserCodemodCatalog().registry,
	sourceScanner: SOURCE_SCANNER_SERVICE,
	loweringRegistry: STYLE_LOWERING_REGISTRY,
	resolveAdapterRegistry: resolveNodeAdapterRegistry,
};

export function createStyleMigrationUseCase(
	implementation: StyleMigrationImplementation = createAdapterMigrationEngine(
		DEFAULT_ADAPTER_MIGRATION_PORTS,
	),
): StyleMigrationUseCase {
	return {
		schema: STYLE_MIGRATION_USE_CASE_SCHEMA,
		run: (source, options) => implementation.run(source, options),
		runAsync: (source, options) => implementation.runAsync(source, options),
	};
}

export const STYLE_MIGRATION_USE_CASE = createStyleMigrationUseCase();

/** Run one v2 adapter-to-adapter migration over a source file. */
export function runAdapterMigration(
	source: string,
	options: AdapterMigrationOptions,
): AdapterMigrationResult {
	return STYLE_MIGRATION_USE_CASE.run(source, options);
}

/**
 * Project-aware migration entry point. Official ecosystem packages are
 * optional: adapters use them when installed in the host project and retain
 * their deterministic source fallback otherwise.
 */
export function runAdapterMigrationAsync(
	source: string,
	options: AdapterMigrationOptions,
): Promise<AdapterMigrationResult> {
	return STYLE_MIGRATION_USE_CASE.runAsync(source, options);
}
