import { createCodemodAdapterCatalog, type CodemodAdapterCatalog } from "./adapter-catalog-core.ts";
import { BUILTIN_ADAPTER_PLUGIN, createBuiltinAdapterPlugin } from "./adapters/plugin.ts";
import type { TailwindUtilityResolver } from "./adapters/tailwind.adapter.ts";

export interface BrowserCodemodCatalogOptions {
	/** Optional in-memory Tailwind compiler used by browser hosts. */
	readonly tailwindResolver?: TailwindUtilityResolver;
}

/** Browser composition root: no filesystem or project-module loader is reachable. */
export function createBrowserCodemodCatalog(
	options: BrowserCodemodCatalogOptions = {},
): CodemodAdapterCatalog {
	return createCodemodAdapterCatalog(
		options.tailwindResolver === undefined
			? BUILTIN_ADAPTER_PLUGIN
			: createBuiltinAdapterPlugin(undefined, undefined, {
					tailwindResolver: options.tailwindResolver,
				}),
	);
}
