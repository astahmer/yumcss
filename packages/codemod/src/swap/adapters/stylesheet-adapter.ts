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
	AdapterHostRewriteContext,
	AdapterEmitContext,
	AdapterGeneratedFile,
} from "../adapter-contract.ts";
import {
	dirnameDocumentPath,
	isAbsoluteDocumentPath,
	joinDocumentPath,
	relativeDocumentPath,
} from "../../path-utils.ts";
import {
	AdapterOfficialApiStatusTag,
	CodemodAdapterId,
	StyleProgramEmissionHint,
	StyleHostRepresentationKind,
} from "../identifiers.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import {
	StyleRuleKindTag,
	StyleProgramResidualKindTag,
	type StyleProgram,
	type StyleProgramResidual,
} from "../semantic-ir.ts";
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
	readonly classStringArtifact?: {
		readonly kind: "global" | "css-modules";
		readonly outputExtension: string;
		readonly importSpecifierExtension: string;
	};
	readonly keyframesArtifact?: {
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

const isStaticClassStringProgram = (program: StyleProgram): boolean =>
	program.emissionHints?.includes(StyleProgramEmissionHint.ClassString) === true &&
	program.residuals.length === 0 &&
	!StyleProgramAnalysis.hasDynamic(program) &&
	(program.themes?.length ?? 0) === 0 &&
	(program.compositions?.length ?? 0) === 0 &&
	(program.plugins?.length ?? 0) === 0 &&
	program.runtime === undefined;

const isStaticNamedClassMapProgram = (program: StyleProgram): boolean =>
	program.emissionHints?.includes(StyleProgramEmissionHint.NamedClassMap) === true &&
	program.rules.some((rule) => rule.kind === StyleRuleKindTag.Style && rule.name !== undefined) &&
	program.rules.every(
		(rule) =>
			(rule.kind === StyleRuleKindTag.Style && rule.name !== undefined) ||
			(rule.kind === StyleRuleKindTag.Style &&
				rule.name === undefined &&
				rule.declarations.length === 0 &&
				rule.children.length === 0),
	) &&
	program.residuals.length === 0 &&
	!StyleProgramAnalysis.hasDynamic(program) &&
	(program.themes?.length ?? 0) === 0 &&
	(program.compositions?.length ?? 0) === 0 &&
	(program.plugins?.length ?? 0) === 0 &&
	program.runtime === undefined;

const isStaticKeyframesProgram = (program: StyleProgram): boolean =>
	program.emissionHints?.includes(StyleProgramEmissionHint.KeyframeName) === true &&
	program.rules.length === 1 &&
	program.rules[0]?.kind === StyleRuleKindTag.Keyframes &&
	program.residuals.length === 0 &&
	!StyleProgramAnalysis.hasDynamic(program) &&
	(program.themes?.length ?? 0) === 0 &&
	(program.compositions?.length ?? 0) === 0 &&
	(program.plugins?.length ?? 0) === 0 &&
	program.runtime === undefined;

const projectRelativeFile = (context: AdapterEmitContext): string | undefined => {
	if (!isAbsoluteDocumentPath(context.file)) return joinDocumentPath(context.file);
	if (context.config.root === undefined) return undefined;
	return relativeDocumentPath(context.config.root, context.file);
};

const cssModuleClassArtifact = (
	context: AdapterEmitContext,
	binding: string,
	className: string,
	outputExtension: string,
	content: string,
):
	| { readonly file: AdapterGeneratedFile; readonly specifier: string; readonly local: string }
	| undefined => {
	const file = projectRelativeFile(context);
	if (file === undefined) return undefined;
	const directory = dirnameDocumentPath(file);
	const fileName = file.split("/").at(-1);
	if (fileName === undefined) return undefined;
	const stem = fileName.replace(/\.[^.]+$/u, "");
	const path = joinDocumentPath(directory, stem + ".yumcss-" + className + outputExtension);
	let specifier = relativeDocumentPath(directory, path);
	if (!specifier.startsWith(".")) specifier = "./" + specifier;
	const safeBinding = binding.replace(/[^A-Za-z0-9_$]/gu, "_");
	return {
		file: {
			path,
			content,
			purpose: "CSS Modules styles for a migrated static class",
		},
		specifier,
		local: "__yumcss" + safeBinding + "Styles",
	};
};

const canRewriteStaticClassHost = (file: string, program: StyleProgram): boolean =>
	/\.[cm]?[jt]sx?$/iu.test(file) &&
	program.source?.hostOpenTag !== undefined &&
	(program.source.hostStyleAttributes?.length ?? 0) === 1 &&
	/^\s*(?:className|class)\s*=\s*(?:"[^"\n]*"|'[^'\n]*'|\{\s*(?:"[^"\n]*"|'[^'\n]*')\s*\})$/u.test(
		program.source?.hostStyleAttributes?.[0] ?? "",
	);

const rewriteStaticClassHost = (context: AdapterHostRewriteContext) => {
	const openingTag = context.program.source?.hostOpenTag;
	const attributes = context.program.source?.hostStyleAttributes ?? [];
	if (openingTag === undefined || attributes.length === 0)
		return { code: context.code, residuals: [] };
	if (!canRewriteStaticClassHost(context.file, context.program))
		return {
			code: context.code,
			residuals: [
				{
					kind: StyleProgramResidualKindTag.HostFramework,
					text: openingTag,
					hint: "stylesheet class artifacts require a JSX host with a static class attribute",
				},
			],
		};
	if (context.residuals !== undefined && context.residuals.length > 0)
		return { code: context.code, residuals: context.residuals };
	const attribute = attributes[0];
	if (attribute === undefined) return { code: context.code, residuals: [] };
	const name = /^(?:\s*)(className|class)\s*=/u.exec(attribute)?.[1];
	if (name === undefined)
		return {
			code: context.code,
			residuals: [
				{
					kind: StyleProgramResidualKindTag.HostFramework,
					text: attribute,
					hint: "stylesheet class artifacts require an exact class or className attribute",
				},
			],
		};
	const tagIndex = context.code.indexOf(openingTag);
	const attributeIndex = openingTag.indexOf(attribute);
	if (tagIndex < 0 || attributeIndex < 0 || openingTag.indexOf(attribute, attributeIndex + 1) >= 0)
		return {
			code: context.code,
			residuals: [
				{
					kind: StyleProgramResidualKindTag.HostFramework,
					text: openingTag,
					hint: "stylesheet class artifact migration could not locate one exact source class attribute",
				},
			],
		};
	const frameworkClassName =
		context.framework === BuiltinHostFramework.React ||
		context.framework === BuiltinHostFramework.Preact;
	const frameworkClass = context.framework === BuiltinHostFramework.Solid;
	const attributeName = frameworkClassName ? "className" : frameworkClass ? "class" : name;
	const replacement = `${attributeName}={${context.emittedExpression}}`;
	const rewrittenTag =
		openingTag.slice(0, attributeIndex) +
		replacement +
		openingTag.slice(attributeIndex + attribute.length);
	return {
		code:
			context.code.slice(0, tagIndex) +
			rewrittenTag +
			context.code.slice(tagIndex + openingTag.length),
		residuals: [],
	};
};

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
			"named-rules": "exact",
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
				...(definition.classStringArtifact === undefined
					? {}
					: {
							handlesHostRewrites: true,
							handlesFrameworkSemantics: true,
							handlesSourceHostAttributes: true,
							resolveHostRepresentation: ({ program }) =>
								isStaticClassStringProgram(program) || program.source?.subject !== undefined
									? StyleHostRepresentationKind.Class
									: undefined,
							rewriteHost: rewriteStaticClassHost,
						}),
				preflight: ({ file, source, program }) => {
					if (componentArtifact !== undefined && program.source?.subject !== undefined) {
						const reason = reactStyledComponentUnsupportedReason(file, source, program);
						return reason === undefined ? [] : [componentResidual(program.source.subject, reason)];
					}
					if (definition.classStringArtifact !== undefined && isStaticClassStringProgram(program)) {
						if (
							(program.source?.hostStyleAttributes?.length ?? 0) > 0 &&
							!canRewriteStaticClassHost(file, program)
						)
							return [
								{
									kind: StyleProgramResidualKindTag.HostFramework,
									text: program.source?.hostOpenTag ?? source,
									hint: "stylesheet class artifacts require a JSX host with a static class attribute",
								},
							];
						return [];
					}
					if (definition.classStringArtifact !== undefined && isStaticNamedClassMapProgram(program))
						return [];
					if (definition.keyframesArtifact !== undefined && isStaticKeyframesProgram(program))
						return [];
					if (
						program.emissionHints?.includes(StyleProgramEmissionHint.KeyframeName) === true &&
						definition.keyframesArtifact === undefined
					)
						return [
							{
								kind: StyleProgramResidualKindTag.Capability,
								text: source,
								hint: `${definition.name} cannot reference a generated keyframe name without a verified global keyframe artifact`,
							},
						];
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
				definition.classStringArtifact !== undefined &&
				context !== undefined &&
				(context.loweringResiduals?.length ?? 0) === 0 &&
				isStaticNamedClassMapProgram(program)
			) {
				const namedRules = program.rules.filter((rule) => rule.name !== undefined);
				const artifactBinding = binding ?? `group${context.index}`;
				const classNames = namedRules.map((rule, index) =>
					reactStyledComponentClassName(context.file, `${artifactBinding}-${rule.name ?? index}`),
				);
				const stylesheet =
					namedRules
						.map((rule, index) => {
							const styleProgram: StyleProgram = {
								...program,
								rules: [{ ...rule, name: undefined }],
								emissionHints: [],
							};
							return `.${classNames[index]} { ${renderers.templateCss(styleProgram).trim()} }`;
						})
						.join("\n") + "\n";
				if (definition.classStringArtifact.kind === "global") {
					const artifact = reactStyledComponentArtifact(
						context,
						artifactBinding,
						definition.classStringArtifact.outputExtension,
						definition.classStringArtifact.importSpecifierExtension,
						stylesheet,
						`${definition.name} styles for a migrated static group`,
					);
					if (artifact === undefined)
						return {
							text: "{}",
							semantic: program,
							residuals: [
								{
									kind: StyleProgramResidualKindTag.Capability,
									text: artifactBinding,
									hint:
										definition.name + " cannot resolve a project-relative stylesheet artifact path",
								},
							],
						};
					const entries = namedRules.map(
						(rule, index) => `${JSON.stringify(rule.name)}: ${JSON.stringify(classNames[index])}`,
					);
					return {
						text: `{ ${entries.join(", ")} }`,
						semantic: program,
						imports: [`import ${JSON.stringify(artifact.specifier)};`],
						generatedFiles: [artifact.file],
						residuals: [],
					};
				}
				const artifact = cssModuleClassArtifact(
					context,
					artifactBinding,
					reactStyledComponentClassName(context.file, `group${context.index}`),
					definition.classStringArtifact.outputExtension,
					stylesheet,
				);
				if (artifact === undefined)
					return {
						text: "{}",
						semantic: program,
						residuals: [
							{
								kind: StyleProgramResidualKindTag.Capability,
								text: artifactBinding,
								hint:
									definition.name + " cannot resolve a project-relative stylesheet artifact path",
							},
						],
					};
				const entries = namedRules.map(
					(rule, index) =>
						`${JSON.stringify(rule.name)}: ${artifact.local}[${JSON.stringify(classNames[index])}]`,
				);
				return {
					text: `{ ${entries.join(", ")} }`,
					semantic: program,
					imports: [`import ${artifact.local} from ${JSON.stringify(artifact.specifier)};`],
					generatedFiles: [artifact.file],
					residuals: [],
				};
			}
			if (
				definition.keyframesArtifact !== undefined &&
				context !== undefined &&
				(context.loweringResiduals?.length ?? 0) === 0 &&
				isStaticKeyframesProgram(program)
			) {
				const artifactBinding = binding ?? `keyframes${context.index}`;
				const keyframeName = reactStyledComponentClassName(
					context.file,
					`keyframes${context.index}`,
				).replace(/^pw-/u, "pw-kf-");
				const keyframeProgram: StyleProgram = {
					...program,
					rules: program.rules.map((rule) => ({ ...rule, name: keyframeName })),
				};
				const artifact = reactStyledComponentArtifact(
					context,
					artifactBinding,
					definition.keyframesArtifact.outputExtension,
					definition.keyframesArtifact.importSpecifierExtension,
					renderers.templateCss(keyframeProgram) + "\n",
					`${definition.name} keyframes for a migrated static animation`,
				);
				if (artifact === undefined)
					return {
						text: "",
						semantic: program,
						residuals: [
							{
								kind: StyleProgramResidualKindTag.Capability,
								text: artifactBinding,
								hint: definition.name + " cannot resolve a project-relative keyframe artifact path",
							},
						],
					};
				return {
					text: JSON.stringify(keyframeName),
					semantic: keyframeProgram,
					imports: [`import ${JSON.stringify(artifact.specifier)};`],
					generatedFiles: [artifact.file],
					residuals: [],
				};
			}
			if (
				definition.classStringArtifact !== undefined &&
				context !== undefined &&
				(context.loweringResiduals?.length ?? 0) === 0 &&
				isStaticClassStringProgram(program)
			) {
				const styleText = renderers.templateCss(program).trim();
				if (styleText.length === 0)
					return { text: JSON.stringify(""), semantic: program, residuals: [] };
				const projectFile = projectRelativeFile(context);
				if (projectFile === undefined)
					return {
						text: "",
						semantic: program,
						residuals: [
							{
								kind: StyleProgramResidualKindTag.Capability,
								text: binding ?? program.source?.pattern ?? definition.name,
								hint:
									definition.name + " cannot resolve a project-relative stylesheet artifact path",
							},
						],
					};
				const artifactBinding = binding ?? "style" + context.index;
				const className = reactStyledComponentClassName(projectFile, artifactBinding);
				const stylesheet = "." + className + " { " + styleText + " }\n";
				if (definition.classStringArtifact.kind === "global") {
					const artifact = reactStyledComponentArtifact(
						context,
						artifactBinding,
						definition.classStringArtifact.outputExtension,
						definition.classStringArtifact.importSpecifierExtension,
						stylesheet,
						definition.name + " styles for a migrated static class",
					);
					if (artifact === undefined)
						return {
							text: "",
							semantic: program,
							residuals: [
								{
									kind: StyleProgramResidualKindTag.Capability,
									text: artifactBinding,
									hint:
										definition.name + " cannot resolve a project-relative stylesheet artifact path",
								},
							],
						};
					return {
						text: JSON.stringify(className),
						semantic: program,
						imports: ['import "' + artifact.specifier + '";'],
						generatedFiles: [artifact.file],
						residuals: [],
					};
				}
				const artifact = cssModuleClassArtifact(
					context,
					artifactBinding,
					className,
					definition.classStringArtifact.outputExtension,
					stylesheet,
				);
				if (artifact === undefined)
					return {
						text: "",
						semantic: program,
						residuals: [
							{
								kind: StyleProgramResidualKindTag.Capability,
								text: artifactBinding,
								hint:
									definition.name + " cannot resolve a project-relative stylesheet artifact path",
							},
						],
					};
				return {
					text: artifact.local + "[" + JSON.stringify(className) + "]",
					semantic: program,
					imports: ["import " + artifact.local + ' from "' + artifact.specifier + '";'],
					generatedFiles: [artifact.file],
					residuals: [],
				};
			}
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
