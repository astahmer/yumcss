import { CodemodAdapterId } from "../identifiers.ts";
import type { ProjectModuleLoader } from "../project-module-loader.ts";
import type { StylesheetCompilerPort } from "../stylesheet-source.ts";
import { createStylesheetAdapter } from "./stylesheet-adapter.ts";

function createLessCompiler(loader: ProjectModuleLoader): StylesheetCompilerPort {
	return {
		async compile(source, context) {
			const module = await loader.importPackage<{
				render?: (
					source: string,
					options?: { filename?: string; paths?: readonly string[] },
				) => Promise<{ css: string; imports?: readonly string[]; map?: string }>;
			}>("less", context.root ?? ".");
			if (module?.render === undefined) throw new Error("less.render is unavailable");
			const result = await module.render(source, {
				filename: context.file,
				...(context.root === undefined ? {} : { paths: [context.root] }),
			});
			return {
				css: result.css,
				dependencies: result.imports,
				...(result.map === undefined ? {} : { sourceMap: result.map }),
			};
		},
	};
}

export function createLessAdapter(moduleLoader?: ProjectModuleLoader) {
	return createStylesheetAdapter({
		id: CodemodAdapterId.Less,
		name: "less",
		extensions: [".less"],
		packages: { packages: [{ name: "less", kind: "config" }] },
		compilerName: "less",
		...(moduleLoader === undefined ? {} : { compiler: createLessCompiler(moduleLoader) }),
	});
}

export const lessAdapter = createLessAdapter();
export default lessAdapter;
