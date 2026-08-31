import { readFileSync } from "node:fs";
import { NODE_PROJECT_MODULE_LOADER } from "./project-module-loader.ts";
import { createBuiltinAdapterPlugin } from "./adapters/plugin.ts";
import type { AdapterConfigContext, StyleAdapter } from "./adapter-contract.ts";
import { createCodemodAdapterCatalog, type CodemodAdapterCatalog } from "./adapter-catalog-core.ts";

export type { CodemodAdapterCatalog } from "./adapter-catalog-core.ts";

/** Build the default composition root without exposing adapter implementation modules. */
export function createBuiltinCodemodCatalog(): CodemodAdapterCatalog {
	const sourcePlugin = createBuiltinAdapterPlugin(NODE_PROJECT_MODULE_LOADER);
	const readFile = (file: string): string | undefined => {
		try {
			return readFileSync(file, "utf8");
		} catch {
			return undefined;
		}
	};
	const adapters = sourcePlugin.adapters.map((adapter): StyleAdapter => ({
		...adapter,
		loadConfig: (context: AdapterConfigContext) =>
			adapter.loadConfig({ ...context, readFile: context.readFile ?? readFile }),
		...(adapter.loadConfigAsync === undefined
			? {}
			: {
					loadConfigAsync: (context: AdapterConfigContext) =>
						adapter.loadConfigAsync!({ ...context, readFile: context.readFile ?? readFile }),
				}),
	}));
	return createCodemodAdapterCatalog({ ...sourcePlugin, adapters });
}
