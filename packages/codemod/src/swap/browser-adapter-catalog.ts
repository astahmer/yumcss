import { createCodemodAdapterCatalog, type CodemodAdapterCatalog } from "./adapter-catalog-core.ts";
import { BUILTIN_ADAPTER_PLUGIN } from "./adapters/plugin.ts";

/** Browser composition root: no filesystem or project-module loader is reachable. */
export function createBrowserCodemodCatalog(): CodemodAdapterCatalog {
	return createCodemodAdapterCatalog(BUILTIN_ADAPTER_PLUGIN);
}
