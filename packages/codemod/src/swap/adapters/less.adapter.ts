import { CodemodAdapterId } from "../identifiers.ts";
import { AdapterDependencyKindTag } from "../adapter-contract.ts";
import type { ProjectModuleLoader } from "../project-module-loader.ts";
import type { StylesheetCompilerPort } from "../stylesheet-source.ts";
import { createStylesheetAdapter } from "./stylesheet-adapter.ts";

interface LessModule {
	readonly render?: (
		source: string,
		options?: { filename?: string; paths?: readonly string[] },
	) => Promise<{ css: string; imports?: readonly string[]; map?: string }>;
}

function lessModule(
	value: LessModule & { readonly default?: LessModule; readonly "module.exports"?: LessModule },
): LessModule {
	return value.render === undefined ? (value.default ?? value["module.exports"] ?? value) : value;
}

function createLessCompiler(loader: ProjectModuleLoader): StylesheetCompilerPort {
	return {
		async compile(source, context) {
			const loaded = await loader.importPackage<
				LessModule & { readonly default?: LessModule; readonly "module.exports"?: LessModule }
			>("less", context.root ?? ".");
			const module = loaded === undefined ? undefined : lessModule(loaded);
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
		packages: { packages: [{ name: "less", kind: AdapterDependencyKindTag.Config }] },
		compilerName: "less",
		classStringArtifact: {
			kind: "global",
			outputExtension: ".less",
			importSpecifierExtension: ".less",
		},
		keyframesArtifact: {
			outputExtension: ".less",
			importSpecifierExtension: ".less",
		},
		reactComponentArtifact: {
			outputExtension: ".less",
			importSpecifierExtension: ".less",
		},
		...(moduleLoader === undefined ? {} : { compiler: createLessCompiler(moduleLoader) }),
	});
}

export const lessAdapter = createLessAdapter();
