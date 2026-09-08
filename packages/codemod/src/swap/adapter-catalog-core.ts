import {
	createStyleAdapterRegistry,
	type StyleAdapterPlugin,
	type StyleAdapterRegistry,
} from "./adapter-registry.ts";

export interface CodemodAdapterCatalog {
	readonly adapters: StyleAdapterRegistry["adapters"];
	readonly registry: StyleAdapterRegistry;
}

/** Compose a catalog from an environment-owned plugin without importing Node facilities. */
export function createCodemodAdapterCatalog(plugin: StyleAdapterPlugin): CodemodAdapterCatalog {
	const registry = createStyleAdapterRegistry();
	registry.registerPlugin(plugin);
	const adapters = registry.adapters;
	return {
		adapters,
		registry,
	};
}
