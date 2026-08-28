import { createStyleAdapterRegistry, type StyleAdapterRegistry } from "./adapter-registry.ts";
import { BUILTIN_ADAPTER_PLUGIN } from "./adapters/plugin.ts";
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

/** Build the default composition root without exposing adapter implementation modules. */
export function createBuiltinCodemodCatalog(): CodemodAdapterCatalog {
	const registry = createStyleAdapterRegistry();
	registry.registerPlugin(BUILTIN_ADAPTER_PLUGIN);
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
