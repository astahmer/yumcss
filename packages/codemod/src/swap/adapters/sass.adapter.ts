import { CodemodAdapterId } from "../identifiers.ts";
import type { ProjectModuleLoader } from "../project-module-loader.ts";
import type { StylesheetCompilerPort } from "../stylesheet-source.ts";
import { createStylesheetAdapter } from "./stylesheet-adapter.ts";

function createSassCompiler(loader: ProjectModuleLoader): StylesheetCompilerPort {
	return {
		async compile(source, context) {
			const module = await loader.importPackage<{
				compileString?: (
					source: string,
					options?: { syntax?: "scss" | "indented"; loadPaths?: readonly string[] },
				) => { css: string; loadedUrls?: readonly URL[] };
			}>("sass", context.root ?? ".");
			if (module?.compileString === undefined) throw new Error("sass.compileString is unavailable");
			const result = module.compileString(source, {
				syntax: context.file.endsWith(".sass") ? "indented" : "scss",
				...(context.root === undefined ? {} : { loadPaths: [context.root] }),
			});
			return {
				css: result.css,
				dependencies: result.loadedUrls?.map((url) => url.pathname),
			};
		},
	};
}

export function createSassAdapter(moduleLoader?: ProjectModuleLoader) {
	return createStylesheetAdapter({
		id: CodemodAdapterId.Sass,
		name: "sass",
		extensions: [".sass", ".scss"],
		packages: { packages: [{ name: "sass", kind: "config" }] },
		compilerName: "sass",
		...(moduleLoader === undefined ? {} : { compiler: createSassCompiler(moduleLoader) }),
	});
}

export const sassAdapter = createSassAdapter();
export default sassAdapter;
