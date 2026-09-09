import {
	StyleRuleKindTag,
	styleProgramFromRules,
	type StyleProgram,
	type StyleProgramOptions,
	type StyleProgramResidual,
} from "./semantic-ir.ts";
import {
	ADAPTER_CONTRACT_SCHEMA,
	AdapterDependencyKindTag,
	type AdapterConfigContext,
	type AdapterDependencies,
	type AdapterDetectionContext,
	type AdapterDetectionResult,
	type AdapterEmitContext,
	type AdapterEmitResult,
	type AdapterGeneratedFile,
	type AdapterMigrationHooks,
	type AdapterParseContext,
	type AdapterParseResult,
	type AdapterProjectConfig,
	type AdapterTokenPolicy,
	type StyleAdapter,
} from "./adapter-contract.ts";
import { AdapterCapabilityLevelTag, type AdapterCapabilities } from "./capabilities.ts";
import type { SourceBinding } from "pandwind/source";
import type { JsxStyleHostMatch, JsxStylePropSelector } from "./jsx-style-host.ts";
import type { StyleLowering } from "./lowering.ts";
import {
	CodemodCallPatternFormTag,
	CodemodCallPatternKindTag,
	StyleNamedRuleStrategy,
	StyleRepresentationKind,
} from "./identifiers.ts";
import {
	projectDynamicClassMigration,
	projectPortableDynamicMigration,
	projectStaticSubjectMigration,
} from "./adapter-projections.ts";
import { PortableStyleArtifact } from "./portable-artifact.ts";
import { AdapterEvidence, type AdapterOfficialApiManifestOptions } from "./adapter-evidence.ts";
import { CodemodAdapterKit } from "./adapter-definition.ts";
import { AdapterParser } from "./adapter-parser.ts";
import { AdapterRenderersImplementation } from "./adapter-renderers.ts";
import { validateAdapterPrograms } from "./adapter-validation.ts";

export { CodemodAdapterKit } from "./adapter-definition.ts";
/** Adapter ids are registry-defined so adding an adapter does not require a central union edit. */
export type ExternalAdapterId = string;

export type CallPattern = {
	readonly name: string;
	readonly regex: RegExp;
	/** Restrict residual or syntax patterns to source files using this adapter. */
	readonly sourceGuard?: (source: string, context: AdapterParseContext) => boolean;
	/** Resolve authored aliases through the shared AST binding index. */
	readonly semanticBindings?: readonly { source: string; imported: string }[];
	readonly regexForBinding?: (binding: SourceBinding) => RegExp;
	readonly form?: `${CodemodCallPatternFormTag}`;
	readonly residual?: Pick<StyleProgramResidual, "kind" | "hint">;
	readonly functionCall?: Pick<
		import("./function-style-parser.ts").FunctionStyleCallParserOptions,
		"functionCall" | "namedObjects" | "sourceObjectOptions" | "subjectFromMatch"
	>;
	readonly kind?: CodemodCallPatternKindTag;
	readonly objectKind?: StyleProgramOptions["nestedObjectKind"];
	readonly sourceObjectOptions?: AdapterSourceObjectOptionsProvider;
	/** Optional source syntax immediately following the balanced call body. */
	readonly suffix?: RegExp;
	readonly styleProps?:
		| readonly string[]
		| ((context: AdapterParseContext) => JsxStylePropSelector);
	/** Source-specific host props that must remain for component semantics. */
	readonly preserveHostStyleProps?: (host: JsxStyleHostMatch) => readonly string[];
	readonly transform?: (program: StyleProgram, context: AdapterParseContext) => StyleProgram;
};

export type AdapterSourceObjectOptions = Pick<
	StyleProgramOptions,
	| "conditionKinds"
	| "conditionValues"
	| "conditionRaw"
	| "nestedObjectKind"
	| "namedRuleObjects"
	| "propertyValueConditions"
	| "unwrapNestedObjectKeys"
	| "ignoredObjectKeys"
	| "variantContainerKeys"
	| "computedKeys"
	| "computedKeyResolver"
	| "dynamicReferences"
	| "objectReferences"
	| "propertyAliases"
	| "valueTransforms"
	| "emissionHints"
	| "canonicalization"
	| "compositions"
	| "compositionArrayKeys"
>;
export type AdapterSourceObjectOptionsProvider =
	| AdapterSourceObjectOptions
	| ((source: string, context: AdapterParseContext) => AdapterSourceObjectOptions);

export interface AdapterRenderers {
	readonly firstKind: (program: StyleProgram) => StyleProgram["rules"][number]["kind"];
	readonly programObject: (program: StyleProgram) => string;
	readonly declarationsObject: (
		declarations: readonly StyleProgram["declarations"][number][],
	) => string;
	readonly templateCss: (program: StyleProgram) => string;
}

/**
 * Adapter emitters may add residuals, but ordinary exact emitters should not
 * have to manufacture an empty array. The registry adds the canonical source
 * and emitted residuals together at the boundary.
 */
export type CodemodAdapterEmission = Pick<
	AdapterEmitResult,
	"text" | "imports" | "generatedStatements" | "semantic"
> & {
	readonly residuals?: readonly StyleProgramResidual[];
	readonly generatedFiles?: readonly AdapterGeneratedFile[];
};

export interface CodemodAdapterSpec {
	readonly id: ExternalAdapterId;
	readonly patterns: readonly CallPattern[];
	readonly packages: AdapterDependencies;
	readonly capabilities: AdapterCapabilities;
	readonly detectPatterns: readonly RegExp[];
	readonly sourceModules: readonly string[];
	readonly sourceModuleMatchers?: readonly ((moduleSpecifier: string) => boolean)[];
	readonly lowerings?: readonly StyleLowering[];
	readonly configFiles?: readonly string[];
	readonly detect?: (
		context: AdapterDetectionContext,
		fallback: () => AdapterDetectionResult,
	) => AdapterDetectionResult;
	readonly loadConfig?: (context: AdapterConfigContext) => AdapterProjectConfig;
	readonly loadConfigAsync?: (context: AdapterConfigContext) => Promise<AdapterProjectConfig>;
	readonly parse?: (source: string, context: AdapterParseContext) => AdapterParseResult;
	readonly postprocessEmit?: (
		emission: CodemodAdapterEmission,
		context: AdapterEmitContext,
	) => CodemodAdapterEmission;
	readonly sourceObjectOptions?: AdapterSourceObjectOptionsProvider;
	readonly migration?: AdapterMigrationHooks;
	/** Documentation-driven public API surface. */
	readonly officialApi?: AdapterOfficialApiManifestOptions;
	/** Target-owned policy for verified custom-token recovery. */
	readonly tokenPolicy?: AdapterTokenPolicy;
	/** Target-owned policy for preserving named style maps without source branches. */
	readonly namedRuleStrategy?: StyleNamedRuleStrategy;
	/** Target-owned opt-in for preserving a complete named map in one emission. */
	readonly preserveNamedRules?: (context: AdapterEmitContext) => boolean;
	emit(
		program: StyleProgram,
		renderers: AdapterRenderers,
		context?: AdapterEmitContext,
	): CodemodAdapterEmission;
}

export function defineCodemodAdapter(spec: CodemodAdapterSpec): StyleAdapter {
	const capabilities =
		spec.namedRuleStrategy === undefined ||
		spec.namedRuleStrategy === StyleNamedRuleStrategy.Unsupported
			? spec.capabilities
			: {
					...spec.capabilities,
					capabilities: {
						...spec.capabilities.capabilities,
						"named-rules": AdapterCapabilityLevelTag.Exact,
					},
				};
	const migration = projectPortableDynamicMigration(
		projectDynamicClassMigration(spec.id, projectStaticSubjectMigration(spec.migration)),
		spec.capabilities,
	);
	const capabilitiesWithRepresentations =
		migration?.targetPolicy?.dynamicClassCarrier === true
			? {
					...capabilities,
					capabilities: {
						...capabilities.capabilities,
						"custom-properties": AdapterCapabilityLevelTag.Exact,
					},
				}
			: capabilities;
	return {
		schema: ADAPTER_CONTRACT_SCHEMA,
		id: spec.id,
		version: "2",
		officialApi: (() => {
			const defaults = AdapterEvidence.defaultManifest({
				patterns: spec.patterns,
				configFiles: spec.configFiles,
				sourceModules: spec.sourceModules,
			});
			return AdapterEvidence.manifest({
				...defaults,
				...spec.officialApi,
				apis: spec.officialApi?.apis ?? defaults.apis,
			});
		})(),
		sourceModules: spec.sourceModules,
		...(spec.sourceModuleMatchers === undefined
			? {}
			: { sourceModuleMatchers: spec.sourceModuleMatchers }),
		capabilities: capabilitiesWithRepresentations,
		dependencies: spec.packages,
		...(spec.tokenPolicy === undefined ? {} : { tokenPolicy: spec.tokenPolicy }),
		...(spec.lowerings === undefined ? {} : { lowerings: spec.lowerings }),
		migration,
		detect: (context) =>
			spec.detect?.(context, () => CodemodAdapterKit.detectBy(spec.detectPatterns, context)) ??
			CodemodAdapterKit.detectBy(spec.detectPatterns, context),
		loadConfig: (context) =>
			AdapterEvidence.normalizeConfig(
				spec.loadConfig?.(context) ??
					CodemodAdapterKit.configFor(spec.id, spec.configFiles ?? [], context),
			),
		...(spec.loadConfigAsync === undefined
			? {}
			: {
					loadConfigAsync: async (context: AdapterConfigContext) =>
						AdapterEvidence.normalizeConfig(await spec.loadConfigAsync!(context)),
				}),
		parse: (source, context) =>
			spec.parse?.(source, context) ??
			AdapterParser.parse(source, context, spec.patterns, spec.sourceObjectOptions),
		emit: (program, context) => {
			const renderers = AdapterRenderersImplementation;
			const render = (value: StyleProgram) => spec.emit(value, renderers, context);
			if (
				context.host?.representationKind === StyleRepresentationKind.PortableArtifact &&
				!program.rules.some((rule) => rule.name !== undefined)
			) {
				const portableProgram = PortableStyleArtifact.restoreDynamicValues(
					program,
					context.loweringResiduals ?? [],
				);
				const dynamic = PortableStyleArtifact.containsDynamicValues(portableProgram);
				return {
					text: dynamic
						? `css.vars(${AdapterRenderersImplementation.programObject(portableProgram)})`
						: `css.class(${AdapterRenderersImplementation.programObject(portableProgram)})`,
					imports: dynamic
						? [
								'import { createRuntimeCss } from "pandwind/css/runtime";',
								'import { pandwindPreset } from "pandwind/preset";',
								"const css = createRuntimeCss(pandwindPreset);",
							]
						: ['import { createCss } from "pandwind/css";', "const css = createCss();"],
					semantic: portableProgram,
					dependencies: {
						packages: [{ name: "pandwind", kind: AdapterDependencyKindTag.Runtime }],
					},
					residuals: [],
				};
			}
			const namedRules = program.rules.filter(
				(rule) => rule.name !== undefined && rule.kind === StyleRuleKindTag.Style,
			);
			const rendered: CodemodAdapterEmission =
				namedRules.length > 0 &&
				spec.namedRuleStrategy === StyleNamedRuleStrategy.ClassMap &&
				spec.preserveNamedRules?.(context) !== true
					? (() => {
							const imports = new Set<string>();
							const generatedStatements = new Set<string>();
							const generatedFiles: AdapterGeneratedFile[] = [];
							const semanticPrograms: StyleProgram[] = [];
							const entries = namedRules.map((rule) => {
								const single = render({
									...program,
									rules: [{ ...rule, name: undefined }],
									declarations: rule.declarations,
								});
								for (const statement of single.imports ?? []) imports.add(statement);
								for (const statement of single.generatedStatements ?? [])
									generatedStatements.add(statement);
								generatedFiles.push(...(single.generatedFiles ?? []));
								if (single.semantic !== undefined) semanticPrograms.push(single.semantic);
								return `${JSON.stringify(rule.name)}: ${single.text}`;
							});
							return {
								text: `{ ${entries.join(", ")} }`,
								imports: [...imports],
								...(generatedStatements.size === 0
									? {}
									: { generatedStatements: [...generatedStatements] }),
								...(generatedFiles.length === 0 ? {} : { generatedFiles }),
								...(semanticPrograms.length === entries.length
									? {
											semantic: styleProgramFromRules(
												semanticPrograms.flatMap((item) => item.rules),
												{
													source: program.source,
													themes: program.themes,
													compositions: program.compositions,
													runtime: program.runtime,
													plugins: program.plugins,
													emissionHints: program.emissionHints,
													canonicalization: program.canonicalization,
												},
											),
										}
									: {}),
							};
						})()
					: render(program);
			const processed = spec.postprocessEmit?.(rendered, context) ?? rendered;
			return {
				...processed,
				dependencies: spec.packages,
				// A target representation may explicitly preserve a source residual
				// (for example, a scalar template expression carried by Chakra's
				// runtime `css` object). It remains in semantic IR for provenance, but
				// must not fail target validation or be reported as an unhandled
				// conversion residual.
				residuals: [
					...program.residuals.filter((residual) => residual.preserved !== true),
					...(processed.residuals ?? []),
				],
			};
		},
		validate: validateAdapterPrograms,
	};
}
