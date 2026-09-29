import {
	CodemodAdapterKit,
	defineCodemodAdapter,
	type CodemodAdapterSpec,
} from "../external-adapters.ts";
import type {
	AdapterConfigContext,
	AdapterProjectConfig,
	AdapterDependencies,
	AdapterComponentRewriteContext,
	AdapterEmitContext,
} from "../adapter-contract.ts";
import {
	AdapterOfficialApiStatusTag,
	CodemodAdapterId,
	StyleHostRepresentationKind,
} from "../identifiers.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import { StyleProgramResidualKindTag, type StyleProgramResidual } from "../semantic-ir.ts";
import {
	createPreprocessorFileMigration,
	createStylesheetFileMigration,
	parseStylesheetPrograms,
	type StylesheetCompilerPort,
} from "../stylesheet-source.ts";
import { StyleProgramAnalysis } from "../style-program-analysis.ts";
import {
	isPlainReactStyleProgram,
	reactStyledComponentArtifact,
	reactStyledComponentClassName,
	reactStyledComponentUnsupportedReason,
	rewriteReactStyledComponent,
} from "./react-styled-component.ts";

export interface StylesheetAdapterDefinition {
	readonly id: CodemodAdapterId;
	readonly name: string;
	readonly extensions: readonly string[];
	readonly packages: AdapterDependencies;
	readonly compilerName?: string;
	readonly compiler?: StylesheetCompilerPort;
	readonly composition?: "partial" | "unsupported";
	readonly reactComponentArtifact?: {
		readonly outputExtension: string;
		readonly importSpecifierExtension: string;
	};
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
	const componentArtifact = definition.reactComponentArtifact;
	const componentResidual = (text: string, hint: string): StyleProgramResidual => ({
		kind: StyleProgramResidualKindTag.Component,
		text,
		hint,
	});
	const rewriteComponent = (context: AdapterComponentRewriteContext) => {
		if (context.phase === "preflight") {
			const reason = reactStyledComponentUnsupportedReason(
				context.file,
				context.source,
				context.program,
				context.sourceFramework,
			);
			return reason === undefined
				? { code: context.code, residuals: [] }
				: { code: context.code, residuals: [componentResidual(context.binding, reason)] };
		}
		const rewrite = rewriteReactStyledComponent(context, context.emittedExpression);
		return {
			code: rewrite.code,
			...(rewrite.imports.length === 0 ? {} : { imports: rewrite.imports }),
			residuals:
				rewrite.reason === undefined ? [] : [componentResidual(context.binding, rewrite.reason)],
		};
	};
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
				...(componentArtifact === undefined
					? {}
					: {
							handlesHostRewrites: true,
							handlesFrameworkSemantics: true,
							hostFrameworks: [BuiltinHostFramework.React],
							hostRepresentation: StyleHostRepresentationKind.Class,
							rewriteComponent,
						}),
				preflight: ({ file, source, program }) => {
					if (componentArtifact !== undefined && program.source?.subject !== undefined) {
						const reason = reactStyledComponentUnsupportedReason(file, source, program);
						return reason === undefined ? [] : [componentResidual(program.source.subject, reason)];
					}
					return [
						{
							kind: StyleProgramResidualKindTag.Capability,
							text: source,
							hint: `${definition.name} emits stylesheet documents and cannot represent a TypeScript style call without a generated stylesheet artifact`,
						},
					];
				},
			},
		},
		emit: (program, renderers, context?: AdapterEmitContext) => {
			const binding = context?.host?.binding;
			if (
				componentArtifact !== undefined &&
				context?.host?.representation === StyleHostRepresentationKind.Class &&
				context.host.framework === BuiltinHostFramework.React &&
				context.host.subject !== undefined &&
				binding !== undefined &&
				isPlainReactStyleProgram(program)
			) {
				const artifact = reactStyledComponentArtifact(
					context,
					binding,
					componentArtifact.outputExtension,
					componentArtifact.importSpecifierExtension,
					`.${reactStyledComponentClassName(context.file, binding)} { ${renderers.templateCss(program)} }\n`,
					`${definition.name} styles for a migrated React component`,
				);
				if (artifact === undefined)
					return {
						text: "",
						semantic: program,
						residuals: [
							componentResidual(
								binding,
								"the generated stylesheet path cannot be resolved relative to the project root",
							),
						],
					};
				return {
					text: JSON.stringify(reactStyledComponentClassName(context.file, binding)),
					semantic: program,
					imports: [`import ${JSON.stringify(artifact.specifier)};`],
					generatedFiles: [artifact.file],
					residuals: [],
				};
			}
			return {
				text: renderers.templateCss(program),
				semantic: program,
				residuals: StyleProgramAnalysis.hasDynamic(program)
					? [
							{
								kind: StyleProgramResidualKindTag.Dynamic,
								text: "dynamic stylesheet value",
								hint: "authored stylesheet values must be statically resolved",
							},
						]
					: [],
			};
		},
	};
	return defineCodemodAdapter(spec);
}
