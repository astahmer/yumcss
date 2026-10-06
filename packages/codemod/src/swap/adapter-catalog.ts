import { readFileSync } from "node:fs";
import { NODE_PROJECT_MODULE_LOADER, type ProjectModuleLoader } from "./project-module-loader.ts";
import { createBuiltinAdapterPlugin } from "./adapters/plugin.ts";
import { createCrossModuleConstResolver } from "yumcss/vite/cross-module-consts";
import { createCodemodAdapterCatalog, type CodemodAdapterCatalog } from "./adapter-catalog-core.ts";

export type { CodemodAdapterCatalog } from "./adapter-catalog-core.ts";

/** Build the default composition root without exposing adapter implementation modules. */
export function createBuiltinCodemodCatalog(
	moduleLoader: ProjectModuleLoader = NODE_PROJECT_MODULE_LOADER,
): CodemodAdapterCatalog {
	const readFile = (file: string): string | undefined => {
		try {
			return readFileSync(file, "utf8");
		} catch {
			return undefined;
		}
	};
	return createCodemodAdapterCatalog(
		createBuiltinAdapterPlugin({
			moduleLoader,
			stylexResolver: createCrossModuleConstResolver(),
			readFile,
		}),
	);
}
