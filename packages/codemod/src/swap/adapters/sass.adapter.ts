import { CodemodAdapterId } from "../identifiers.ts";
import { AdapterDependencyKindTag } from "../adapter-contract.ts";
import type { ProjectModuleLoader } from "../project-module-loader.ts";
import type { StylesheetCompilerPort } from "../stylesheet-source.ts";
import { createStylesheetAdapter } from "./stylesheet-adapter.ts";

interface SassModule {
	readonly compileString?: (
		source: string,
		options?: {
			syntax?: "scss" | "indented";
			loadPaths?: readonly string[];
			sourceMap?: boolean;
		},
	) => { css: string; loadedUrls?: readonly URL[]; sourceMap?: unknown };
}

function sassModule(
	value: SassModule & { readonly default?: SassModule; readonly "module.exports"?: SassModule },
): SassModule {
	return value.compileString === undefined
		? (value.default ?? value["module.exports"] ?? value)
		: value;
}

function createSassCompiler(loader: ProjectModuleLoader): StylesheetCompilerPort {
	return {
		async compile(source, context) {
			const loaded = await loader.importPackage<
				SassModule & { readonly default?: SassModule; readonly "module.exports"?: SassModule }
			>("sass", context.root ?? ".");
			const module = loaded === undefined ? undefined : sassModule(loaded);
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
