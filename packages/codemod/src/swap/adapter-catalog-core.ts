import {
	createStyleAdapterRegistry,
	type StyleAdapterPlugin,
	type StyleAdapterRegistry,
} from "./adapter-registry.ts";
import {
	createStyleSystemRegistry,
	createStyleSystem,
	asStyleDialect,
	type StyleSystemRegistry,
} from "./style-systems.ts";
import { PANDWIND_STYLE_SYSTEM } from "./adapters/core.adapter.ts";
import { CodemodAdapterId } from "./identifiers.ts";

export interface CodemodAdapterCatalog {
	readonly adapters: StyleAdapterRegistry["adapters"];
	readonly registry: StyleAdapterRegistry;
	readonly systems: StyleSystemRegistry;
}

/** Compose a catalog from an environment-owned plugin without importing Node facilities. */
export function createCodemodAdapterCatalog(plugin: StyleAdapterPlugin): CodemodAdapterCatalog {
	const registry = createStyleAdapterRegistry();
	registry.registerPlugin(plugin);
	const adapters = registry.adapters;
	return {
		adapters,
		registry,
		systems: createStyleSystemRegistry([
			PANDWIND_STYLE_SYSTEM,
			...adapters
				.filter((adapter) => adapter.id !== CodemodAdapterId.Pandwind)
				.map((adapter) =>
					createStyleSystem(adapter.id, [
						asStyleDialect(adapter, { system: adapter.id, dialect: "css", role: "both" }),
					]),
				),
		]),
	};
}
