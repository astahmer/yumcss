import { CodemodAdapterId } from "../identifiers.ts";
import { AdapterDependencyKindTag } from "../adapter-contract.ts";
import type { ProjectModuleLoader } from "../project-module-loader.ts";
import type { StylesheetCompilerPort } from "../stylesheet-source.ts";
import { createStylesheetAdapter } from "./stylesheet-adapter.ts";

function createSassCompiler(loader: ProjectModuleLoader): StylesheetCompilerPort {
	return {
		async compile(source, context) {
			const module = await loader.importPackage<{
				compileString?: (
					source: string,
					options?: {
						syntax?: "scss" | "indented";
						loadPaths?: readonly string[];
						sourceMap?: boolean;
					},
				) => { css: string; loadedUrls?: readonly URL[]; sourceMap?: unknown };
			}>("sass", context.root ?? ".");
			if (module?.compileString === undefined) throw new Error("sass.compileString is unavailable");
			const result = module.compileString(source, {
				syntax: context.file.endsWith(".sass") ? "indented" : "scss",
				sourceMap: true,
				...(context.root === undefined ? {} : { loadPaths: [context.root] }),
			});
			return {
				css: result.css,
				dependencies: result.loadedUrls?.map((url) => url.pathname),
				...(result.sourceMap === undefined
					? {}
					: {
							sourceMap:
								typeof result.sourceMap === "string"
									? result.sourceMap
									: JSON.stringify(result.sourceMap),
						}),
			};
		},
	};
}

export function createSassAdapter(moduleLoader?: ProjectModuleLoader) {
	return createStylesheetAdapter({
		id: CodemodAdapterId.Sass,
		name: "sass",
		extensions: [".sass", ".scss"],
		packages: { packages: [{ name: "sass", kind: AdapterDependencyKindTag.Config }] },
		compilerName: "sass",
		...(moduleLoader === undefined ? {} : { compiler: createSassCompiler(moduleLoader) }),
	});
}

export const sassAdapter = createSassAdapter();
