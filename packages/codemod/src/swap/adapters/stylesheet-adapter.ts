import {
	CodemodAdapterKit,
	defineCodemodAdapter,
	type CodemodAdapterSpec,
} from "../external-adapters.ts";
import type {
	AdapterConfigContext,
	AdapterProjectConfig,
	AdapterDependencies,
} from "../adapter-contract.ts";
import {
	AdapterOfficialApiStatusTag,
	CodemodAdapterId,
	StyleRepresentationKind,
} from "../identifiers.ts";
import { StyleRuleKindTag } from "../semantic-ir.ts";
import {
	createPreprocessorFileMigration,
	createStylesheetFileMigration,
	parseStylesheetPrograms,
	type StylesheetCompilerPort,
} from "../stylesheet-source.ts";
import { StyleProgramAnalysis } from "../style-program-analysis.ts";

export interface StylesheetAdapterDefinition {
	readonly id: CodemodAdapterId;
	readonly name: string;
	readonly extensions: readonly string[];
	readonly packages: AdapterDependencies;
	readonly compilerName?: string;
	readonly compiler?: StylesheetCompilerPort;
	readonly composition?: "partial" | "unsupported";
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

/** Shared stylesheet adapter mechanics; each source family owns its definition module. */
export function createStylesheetAdapter(definition: StylesheetAdapterDefinition) {
	const baseMigration = createStylesheetFileMigration();
	const spec: CodemodAdapterSpec = {
		id: definition.id,
		patterns: [],
		packages: definition.packages,
		capabilities: CodemodAdapterKit.allRuleCapabilities(definition.id, "unsupported", {
			"global-rules": "exact",
			keyframes: "exact",
			"font-face": "exact",
			selectors: "exact",
			ordering: "exact",
			"property-rules": "partial",
			nesting: "partial",
			composition: definition.composition ?? "unsupported",
		}),
		detectPatterns: [],
		sourceModules: [],
		configFiles: ["package.json"],
		officialApi: {
			apis: [
				{
					name: definition.name,
					status: AdapterOfficialApiStatusTag.Supported,
					forms: ["source", "target"],
				},
			],
			...(definition.compilerName === undefined
				? {}
				: { compilerIntegrations: [definition.compilerName] }),
		},
		detect: (context) => {
			const matched = fileMatches(context.file, definition.extensions);
			return {
				matched,
				confidence: matched ? 1 : 0,
				evidence: matched ? [definition.name] : [],
			};
		},
		loadConfig: (context) => projectConfig(definition.id, context),
		parse: (source, context) => parseStylesheetPrograms(source, context),
		migration: {
			file:
				definition.compiler === undefined
					? baseMigration
					: createPreprocessorFileMigration(baseMigration, definition.compiler),
			targetPolicy: {
				// Stylesheet targets own authored documents, not TS call-site
				// carriers. A standalone static class expression still has a
				// portable home in the generated artifact, so it resolves to the
				// shared portable carrier instead of splicing selector-less
				// declarations into the host source.
				resolveRepresentation: ({ program, hasHostContext }) =>
					hasHostContext === false &&
					program.source?.hostOpenTag === undefined &&
					program.rules.every((rule) => rule.kind === StyleRuleKindTag.Style) &&
					program.residuals.length === 0
						? StyleRepresentationKind.PortableArtifact
						: undefined,
			},
		},
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
