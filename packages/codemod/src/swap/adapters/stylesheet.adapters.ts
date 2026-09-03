import {
	CodemodAdapterKit,
	defineCodemodAdapter,
	type CodemodAdapterSpec,
} from "../external-adapters.ts";
import {
	type AdapterConfigContext,
	type AdapterProjectConfig,
	type AdapterDependencies,
} from "../adapter-contract.ts";
import { AdapterOfficialApiStatusTag, CodemodAdapterId } from "../identifiers.ts";
import { createStylesheetFileMigration, parseStylesheetPrograms } from "../stylesheet-source.ts";
import { StyleProgramAnalysis } from "../style-program-analysis.ts";

type StylesheetFamily = "css" | "css-modules" | "sass" | "less";

interface StylesheetAdapterOptions {
	readonly id: CodemodAdapterId;
	readonly family: StylesheetFamily;
	readonly extensions: readonly string[];
	readonly packages: AdapterDependencies;
	readonly compiler?: string;
}

function projectConfig(id: CodemodAdapterId, context: AdapterConfigContext): AdapterProjectConfig {
	return {
		adapter: id,
		root: context.root,
		files: [context.file],
		values: { sourceFamily: id },
	};
}

function fileMatches(file: string, extensions: readonly string[]): boolean {
	return extensions.some((extension) => file.endsWith(extension));
}

function createStylesheetAdapter(options: StylesheetAdapterOptions) {
	const spec: CodemodAdapterSpec = {
		id: options.id,
		patterns: [],
		packages: options.packages,
		capabilities: CodemodAdapterKit.allRuleCapabilities(options.id, "unsupported", {
			"global-rules": "exact",
			keyframes: "exact",
			"font-face": "exact",
			selectors: "exact",
			ordering: "exact",
			"property-rules": "partial",
			nesting: "partial",
			composition: options.family === "css-modules" ? "partial" : "unsupported",
		}),
		detectPatterns: [],
		sourceModules: [],
		configFiles: ["package.json"],
		officialApi: {
			apis: [
				{
					name: options.family,
					status: AdapterOfficialApiStatusTag.Supported,
					forms: ["source", "target"],
				},
			],
			...(options.compiler === undefined ? {} : { compilerIntegrations: [options.compiler] }),
		},
		detect: (context) => ({
			matched: fileMatches(context.file, options.extensions),
			confidence: fileMatches(context.file, options.extensions) ? 1 : 0,
			evidence: fileMatches(context.file, options.extensions) ? [options.family] : [],
		}),
		loadConfig: (context) => projectConfig(options.id, context),
		parse: (source, context) => parseStylesheetPrograms(source, context),
		migration: { file: createStylesheetFileMigration() },
		emit: (program, renderers) => ({
			text: renderers.templateCss(program),
			semantic: program,
			residuals: StyleProgramAnalysis.hasDynamic(program)
				? [
						{
							kind: "dynamic",
							text: "dynamic stylesheet value",
							hint: "authored stylesheet values must be statically resolved",
						},
					]
				: [],
		}),
	};
	return defineCodemodAdapter(spec);
}

export const authoredCssAdapter = createStylesheetAdapter({
	id: CodemodAdapterId.AuthoredCss,
	family: "css",
	extensions: [".css"],
	packages: { packages: [] },
});

export const cssModulesAdapter = createStylesheetAdapter({
	id: CodemodAdapterId.CssModules,
	family: "css-modules",
	extensions: [".module.css", ".module.scss", ".module.sass"],
	packages: { packages: [] },
});

export const sassAdapter = createStylesheetAdapter({
	id: CodemodAdapterId.Sass,
	family: "sass",
	extensions: [".sass", ".scss"],
	packages: { packages: [] },
	compiler: "sass",
});

export const lessAdapter = createStylesheetAdapter({
	id: CodemodAdapterId.Less,
	family: "less",
	extensions: [".less"],
	packages: { packages: [] },
	compiler: "less",
});
