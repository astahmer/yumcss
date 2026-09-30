import {
	SwapResidualKindTag,
	styleProgramFromSourceObject,
	styleProgramFromSwapIR,
	type StyleProgram,
	type StyleProgramOptions,
} from "./semantic-ir.ts";
/**
 * Swap orchestration (plans/022): parse source-API call sites -> SwapIR ->
 * emit target API. One pass per (from, to) pair over one file's text.
 *
 * Losslessness contract: a call site is rewritten only when EVERY literal
 * entry can be represented in the target; otherwise the original call stays
 * and a skip marker documents the residuals. Partial rewrites would silently
 * change styling — never acceptable.
 */
import type { PandwindMeta } from "../meta.ts";
import { SourcePass } from "../source-pass-utils.ts";
import { hasCssBinding, relativeModuleImport, ensureImport } from "../shared.ts";
import { simplifyPandwindStaticStyles } from "./static-style-simplifier.ts";
import { SWAP_REGISTRY } from "./swap-registry.ts";
import { createBuiltinCodemodCatalog } from "./adapter-catalog.ts";
import {
	TokenReferenceFormat,
	type TokenReferenceFormat as TokenReferenceFormatValue,
	type TokenRefMode,
} from "./tokens.ts";
import {
	inspectAdapterCapabilities,
	type AdapterCapabilities,
	type AdapterCapabilityMode,
	type AdapterCapabilityReport,
} from "./capabilities.ts";
import { CodemodAdapterId, MigrationSkipReason, SwapTargetId } from "./identifiers.ts";
import type { SwapSource, SwapTarget } from "./cli-args.ts";
export { SWAP_SOURCES, SWAP_TARGETS, parseMigrateArgs } from "./cli-args.ts";
export type { MigrateCliArgs, SwapSource, SwapTarget } from "./cli-args.ts";

const builtinAdapterCatalog = createBuiltinCodemodCatalog();
const builtinAdapterIds = builtinAdapterCatalog.adapters.map((adapter) => adapter.id);
/** Shared composition root for CLI and other Node tooling proof surfaces. */
export const BUILTIN_CODEMOD_CATALOG = builtinAdapterCatalog;
import type { SwapIR } from "./ir.ts";

export { createEngineMissResolver } from "./engine.ts";
export { runPandaMigration } from "./adapters/panda/index.ts";
export type { PandaMigrateOptions, PandaMigrateReport } from "./adapters/panda/index.ts";
export type { PandaCall, PandaRecipeIR } from "./adapters/panda/parse.ts";
export {
	PANDA_MIGRATION_PIPELINE,
	PANDA_MIGRATION_PIPELINE_SCHEMA,
	createPandaMigrationPipeline,
} from "./adapters/panda/index.ts";
export type {
	PandaMigrationContext,
	PandaMigrationPipeline,
	PandaMigrationStageResult,
	PandaMigrationArtifacts,
} from "./adapters/panda/index.ts";
export {
	PANDA_DISCOVERY_SCHEMA,
	discoverPandaFiles,
	discoverPandaMigration,
	extractPandaMigrationUsage,
	loadPandaMigrationTheme,
	scanPandaMigrationSources,
} from "./adapters/panda/index.ts";
export type {
	PandaMigrationFile,
	PandaMigrationSource,
	PandaMigrationWorkspace,
} from "./adapters/panda/index.ts";
export {
	PANDA_MIGRATION_STAGES_SCHEMA,
	convertPandaRecipe,
	convertPandaStyle,
	emitPandaStyle,
	rewritePandaSource,
	validatePandaSource,
} from "./adapters/panda/index.ts";
export {
	STYLE_PROGRAM_SCHEMA,
	SemanticConditionKindTag,
	StyleConditionOperatorTag,
	StyleProgramResidualKindTag,
	StyleDynamicLoweringTag,
	StyleStaticEvaluationStatusTag,
	StyleRuleKindTag,
	StyleValueKindTag,
	SwapResidualKindTag,
	inferSemanticConditionKind,
	orderStyleRules,
	styleProgramFromRules,
	styleProgramFromSourceObject,
	styleProgramFromSwapIR,
	styleProgramToCanonicalCss,
	swapIRFromStyleProgram,
} from "./semantic-ir.ts";
export {
	CodemodAdapterId,
	AdapterConfigEvidenceSourceTag,
	AdapterEvidenceStatusTag,
	AdapterOfficialApiStatusTag,
	AdapterPluginResolutionTag,
	CodemodPatternId,
	CodemodPluginId,
	SwapSourceId,
	SwapTargetId,
	StyleProgramCompositionKind,
	StyleDynamicExpressionKind,
	StyleProgramConditionOrder,
	StyleProgramEmissionHint,
	StyleUtilityDecisionReason,
	StyleUtilityRepresentationKind,
	StyleValidatorId,
	StyleLoweringId,
	StyleRepresentationKind,
	StyleHostRepresentationKind,
	StyleMigrationOutcome,
	StyleNamedRuleStrategy,
	MigrationSkipReason,
	RealRepositoryProofDimension,
	RealRepositoryProofDimensionStatus,
	RealRepositoryProofStatus,
	InstalledProjectProofCheckTag,
	DifferentialProofMode,
	HostComponentRewriterId,
	PandaMigrationStageId,
	CodemodCallPatternFormTag,
	CodemodCallPatternKindTag,
	AdapterCapabilityTag,
	AdapterCapabilityEvidenceStatusTag,
	DifferentialExpectedTag,
	externalIdentifier,
} from "./identifiers.ts";
export { MigrationDiagnostics } from "./migration-diagnostics.ts";
export {
	TOKEN_FORMAT_IDS,
	TOKEN_FORMAT_SCHEMA,
	TokenFormatId,
	TokenFormatLossError,
} from "./token-format-contracts.ts";
export type {
	TokenFormatAdapter,
	TokenFormatFidelity,
	TokenFormatLoss,
	TokenFormatOutput,
	TokenFormatRegistry,
} from "./token-format-contracts.ts";
export {
	createTokenDocument,
	parseDtcgResolverDocument,
	parseDtcgTokenDocument,
	parseTokenDocument,
	parseTokenResolverDocument,
	resolveTokenContext,
	serializeDtcgTokenDocument,
	serializeTokenResolverDocument,
	TOKEN_DOCUMENT_SCHEMA,
	TOKEN_RESOLVER_SCHEMA,
} from "./token-document.ts";
export { TokenDocumentCodec, tokenDocumentCodec } from "./token-document-codec.ts";
export type {
	TokenContextSelection,
	TokenDiagnostic,
	TokenDocument,
	TokenEntry,
	TokenGroup,
	TokenJsonValue,
	TokenNode,
	TokenResolverDocument,
	TokenSourceLoader,
	TokenValue,
} from "./token-document.ts";
export { ADAPTER_MATRIX_SCHEMA, createBidirectionalAdapterMatrix } from "./adapter-matrix.ts";
export type {
	AdapterMatrixCase,
	AdapterMatrixFailure,
	AdapterMatrixFixture,
	AdapterMatrixScenario,
	AdapterMatrixReport,
	BidirectionalAdapterMatrix,
} from "./adapter-matrix.ts";
export {
	ADAPTER_CAPABILITY_LEDGER_SCHEMA,
	createAdapterCapabilityLedger,
	type AdapterCapabilityLedger,
	type AdapterCapabilityLedgerEntry,
	type AdapterCapabilityLedgerEvidence,
	type AdapterCapabilityLedgerProof,
	type CapabilityLedgerOptions,
} from "./capability-ledger.ts";
export {
	REAL_REPOSITORY_PROMOTION_SCHEMA,
	RealRepositoryPromotionStageTag,
	createRealRepositoryPromotionRunner,
	type PromotionCommand,
	type PromotionCommandResult,
	type PromotionMigrationResult,
	type PromotionProofResult,
	type PromotionWorkspace,
	type RealRepositoryPromotionDriver,
	type RealRepositoryPromotionRequest,
	type RealRepositoryPromotionResult,
	type RealRepositoryPromotionRunner,
	type RealRepositoryPromotionStage,
	type RealRepositoryPromotionStageResult,
} from "./real-repository-promotion.ts";

export {
	ADAPTER_CONFORMANCE_SCHEMA,
	createAdapterConformanceSuite,
} from "./adapter-conformance.ts";
export type {
	AdapterConformanceFailure,
	AdapterConformancePhase,
	AdapterConformanceReport,
	AdapterConformanceSuite,
	AdapterDirectConformance,
} from "./adapter-conformance.ts";
export type {
	MigrationResidualLike,
	MigrationSkipDiagnosticInput,
} from "./migration-diagnostics.ts";
export type { ExternalIdentifier } from "./identifiers.ts";
export {
	ADAPTER_EVIDENCE_SCHEMA,
	AdapterEvidence,
	type AdapterConfigEvidence,
	type AdapterEvidenceProfile,
	type AdapterGeneratedArtifactEvidence,
	type AdapterOfficialApi,
	type AdapterOfficialApiManifest,
	type AdapterOfficialApiManifestInput,
	type AdapterOfficialApiManifestOptions,
	type AdapterPluginChain,
	type AdapterPluginEvidence,
} from "./adapter-evidence.ts";
export {
	SEMANTIC_CONTRACT_SUITE_SCHEMA,
	createSemanticContractSuite,
} from "./semantic-contract-suite.ts";
export { StyleProgramBuilder } from "./style-program-builder.ts";
export {
	officialApiCases,
	officialApiFamilyCases,
	type OfficialApiCase,
	type OfficialApiExpectation,
	type OfficialApiFamilyCase,
} from "./official-api-cases.ts";
export {
	STYLE_PROGRAM_ARTIFACT_SCHEMA,
	STYLE_PROGRAM_CORE_VERSION,
	StyleProgramCore,
} from "./style-program-core.ts";
export type {
	StyleProgramArtifact,
	StyleProgramIssue,
	StyleProgramValidation,
} from "./style-program-core.ts";
export type {
	StyleProgramChildInput,
	StyleProgramBuilderOptions,
	StyleProgramKeyframe,
	StyleProgramRuleOptions,
	StyleProgramValueInput,
} from "./style-program-builder.ts";
export { SemanticContractOutcomeTag } from "./semantic-contract-suite.ts";
export type {
	SemanticContractCase,
	SemanticContractFailure,
	SemanticContractFixture,
	SemanticContractOutcome,
	SemanticContractReport,
	SemanticContractSuite,
} from "./semantic-contract-suite.ts";
export { BUILTIN_CODEMOD_ADAPTER_IDS, BUILTIN_STYLE_VALIDATOR_IDS } from "./identifiers.ts";
export {
	ADAPTER_CAPABILITIES_SCHEMA,
	AdapterCapabilityLevelTag,
	createAdapterCapabilityMatrix,
	inspectAdapterCapabilities,
	requiredAdapterCapabilities,
} from "./capabilities.ts";
export type { AdapterCapabilityMatrix, AdapterCapabilityMatrixEntry } from "./capabilities.ts";
export { runAdapterMigration, runAdapterMigrationAsync } from "./adapter-migration.ts";
export { STYLE_MIGRATION_USE_CASE, createStyleMigrationUseCase } from "./adapter-migration.ts";
export { STYLE_MIGRATION_USE_CASE_SCHEMA } from "./adapter-migration-contract.ts";
export { CodemodAdapterKit, defineCodemodAdapter } from "./external-adapters.ts";
export type { ExternalAdapterId } from "./external-adapters.ts";
export { createBuiltinCodemodCatalog } from "./adapter-catalog.ts";
export { createTokenamiAdapter } from "./adapters/tokenami.adapter.ts";
export { createUnoCssAdapter, createUnoCssResolverFromCss } from "./adapters/unocss.adapter.ts";
export { createTailwindAdapter } from "./adapters/tailwind.adapter.ts";
export { createChakraAdapter } from "./adapters/chakra.adapter.ts";
export { createMuiAdapter } from "./adapters/mui.adapter.ts";
export { createMantineAdapter } from "./adapters/mantine.adapter.ts";
export { createPandwindAdapter } from "./adapters/pandwind.adapter.ts";
export { createPandaAdapter } from "./adapters/panda.adapter.ts";
export { createTamaguiAdapter } from "./adapters/tamagui.adapter.ts";
export { createLessAdapter } from "./adapters/less.adapter.ts";
export { createSassAdapter } from "./adapters/sass.adapter.ts";
export {
	PlainStylesheetSource,
	createStylesheetFileMigration,
	parseStylesheetPrograms,
} from "./stylesheet-source.ts";
export type {
	StylesheetSourceDocument,
	StylesheetSourceNode,
	StylesheetSourcePort,
} from "./stylesheet-source.ts";
export { NODE_PROJECT_MODULE_LOADER, NodeProjectModuleLoader } from "./project-module-loader.ts";
export type { ProjectModuleLoader } from "./project-module-loader.ts";
export { getProjectMigrationCommand } from "./project-commands.ts";
export type { ProjectMigrationCommand, ProjectMigrationContext } from "./project-command.ts";
export { createPandwindProjectSupport } from "./project-bootstrap.ts";
export type { PandwindProjectSupport, ProjectBootstrapRequest } from "./project-bootstrap.ts";
export const getCodemodAdapter = (id: string) => builtinAdapterCatalog.registry.get(id);
export function listCodemodAdapterIds(): readonly string[] {
	return builtinAdapterIds;
}
export type { CodemodAdapterCatalog } from "./adapter-catalog.ts";
export type {
	AdapterConfigContext,
	AdapterConfigGraphPort,
	AdapterDependencies,
	AdapterDependency,
	AdapterDependencyKind,
	AdapterDetectionContext,
	AdapterDetectionResult,
	AdapterEmitContext,
	AdapterEmitResult,
	AdapterGeneratedFile,
	AdapterFileChange,
	AdapterMatch,
	AdapterParseContext,
	AdapterParseResult,
	AdapterProjectBindings,
	AdapterProjectConfig,
	AdapterSourceModuleOwnership,
	AdapterTokenCatalog,
	AdapterTokenPolicy,
	AdapterValidationResult,
	AdapterLossiness,
	AdapterDynamicPreparationContext,
	AdapterDynamicPreparation,
	AdapterComponentRewriteContext,
	AdapterComponentRewriteResult,
	AdapterHostRewriteContext,
	AdapterHostRewriteResult,
	AdapterHostDocumentRewriteContext,
	AdapterHostDocumentRewriteResult,
	AdapterRewriteContext,
	AdapterRewriteResult,
	AdapterMigrationHooks,
	StyleAdapter,
} from "./adapter-contract.ts";
export { ADAPTER_CONTRACT_SCHEMA } from "./adapter-contract.ts";
export { ADAPTER_TOKEN_CATALOG_SCHEMA, ADAPTER_TOKEN_POLICY_SCHEMA } from "./adapter-contract.ts";
export { AdapterDependencyKindTag } from "./adapter-contract.ts";
export { AdapterCoverageEvidenceKindTag } from "./coverage-gate.ts";
export { StyleDialectRoleTag } from "./style-systems.ts";
export { TokenCatalog } from "./tokens.ts";
export type {
	TokenCatalogMatch,
	TokenGroupForProperty,
	TokenReferenceFormatter,
} from "./tokens.ts";
export { TOKEN_REFERENCE_FORMATS, TokenReferenceFormat } from "./tokens.ts";
export {
	STYLE_LOWERING_REGISTRY,
	STYLE_LOWERING_SCHEMA,
	STYLE_LOWERINGS,
	STYLE_LOWERING_PLUGIN_SCHEMA,
	BUILTIN_STYLE_LOWERING_PLUGIN,
	createStyleLoweringRegistry,
} from "./lowering.ts";
export type {
	StyleLowering,
	StyleLoweringPlugin,
	StyleLoweringContext,
	StyleLoweringRegistry,
	StyleLoweringResult,
	StyleLoweringPlan,
} from "./lowering.ts";
export type {
	AdapterMigrationOptions,
	AdapterMigrationPorts,
	AdapterMigrationResult,
	AdapterMigrationOutcome,
	StyleMigrationUseCase,
} from "./adapter-migration-contract.ts";
export { createAdapterContractSuite } from "./adapter-contract-suite.ts";
export type {
	AdapterContractFailure,
	AdapterContractFixture,
	AdapterContractPhase,
	AdapterContractReport,
	AdapterContractResult,
	AdapterContractSuite,
} from "./adapter-contract-suite.ts";
export { ADAPTER_COVERAGE_SCHEMA, createAdapterCoverageGate } from "./coverage-gate.ts";
export type {
	AdapterCoverageEntry,
	AdapterCoverageEvidence,
	AdapterCoverageEvidenceKind,
	AdapterCoverageFailure,
	AdapterCoverageGate,
	AdapterCoveragePolicy,
	AdapterCoverageReport,
} from "./coverage-gate.ts";
export type {
	CodemodAdapterSpec,
	CodemodAdapterEmission,
	AdapterRenderers,
	AdapterSourceObjectOptions,
	AdapterSourceObjectOptionsProvider,
} from "./external-adapters.ts";
export {
	ADAPTER_PLUGIN_SCHEMA,
	createStyleAdapterPlugin,
	createStyleAdapterRegistry,
} from "./adapter-registry.ts";
export {
	ADAPTER_MANIFEST_SCHEMA,
	ADAPTER_PACKAGE_FIELD,
	createStyleAdapterManifest,
	readAdapterPackageDeclaration,
	validateStyleAdapterManifest,
} from "./adapter-manifest.ts";
export type {
	AdapterPackageDeclaration,
	StyleAdapterManifest,
	StyleAdapterManifestEntry,
} from "./adapter-manifest.ts";
export type {
	AdapterDiscoveryOptions,
	AdapterDiscoveryResult,
	StyleAdapterPlugin,
	StyleAdapterRegistry,
} from "./adapter-registry.ts";
export { asStyleDialect, createStyleSystem, createStyleSystemRegistry } from "./style-systems.ts";
export type {
	StyleDialectAdapter,
	StyleDialectAddress,
	StyleDialectOptions,
	StyleDialectRole,
	StyleMigrationRoute,
	StyleDialectResolver,
	StyleSystemAdapter,
	StyleSystemRegistry,
} from "./style-systems.ts";
export { STYLE_SYSTEM_SCHEMA } from "./style-systems.ts";
export {
	CORE_STYLE_SYSTEMS,
	PANDA_STYLE_SYSTEM,
	PANDWIND_STYLE_SYSTEM,
} from "./adapters/core.adapter.ts";
export {
	SWAP_REGISTRY,
	SWAP_SOURCE_ADAPTERS,
	SWAP_TARGET_ADAPTERS,
	createSwapRegistry,
} from "./swap-registry.ts";
export type {
	SwapRegistry,
	SwapSourceAdapter,
	SwapSourceContext,
	SwapSourceMatch,
	SwapTargetAdapter,
} from "./swap-registry.ts";
export { runDifferentialFixture, runDifferentialSuite } from "./differential.ts";
export {
	DIFFERENTIAL_MATRIX_SCHEMA,
	runDifferentialMatrix,
	SemanticModelDifferentialProofProvider,
} from "./differential-matrix.ts";
export {
	VALIDATOR_SCHEMA,
	STYLE_VALIDATORS,
	VALIDATOR_PLUGIN_SCHEMA,
	BUILTIN_STYLE_VALIDATOR_PLUGIN,
	createStyleValidatorRegistry,
} from "./validator-registry.ts";
export type {
	StyleValidationContext,
	StyleValidationEvidence,
	StyleValidator,
	StyleValidatorPlugin,
	StyleValidatorRegistry,
} from "./validator-registry.ts";
export {
	createValidatorContractSuite,
	VALIDATOR_CONTRACT_SUITE_SCHEMA,
} from "./validator-contract-suite.ts";
export type {
	ValidatorContractFailure,
	ValidatorContractFixture,
	ValidatorContractPhase,
	ValidatorContractResult,
	ValidatorContractSuite,
} from "./validator-contract-suite.ts";
export type {
	DifferentialBrowserResult,
	DifferentialBrowserState,
	DifferentialFixture,
	DifferentialRender,
	DifferentialResult,
	DifferentialSsrHooks,
	DifferentialSsrResult,
	DifferentialStreamingHooks,
	DifferentialStreamingResult,
} from "./differential.ts";
export { createRealRepositoryCorpus } from "./real-repository-corpus.ts";
export type { RealRepositoryCorpus, RealRepositoryReference } from "./real-repository-corpus.ts";
export {
	MIGRATION_ROUTE_PROOF_CATALOG,
	MIGRATION_ROUTE_PROOF_CATALOG_SCHEMA,
	MigrationRouteMaturityTag,
	MigrationRouteProofExecutionTag,
	MigrationRouteProofRouteId,
	evaluateMigrationRouteProof,
	findMigrationRouteProof,
	migrationRouteProofCatalog,
	validateMigrationRouteProofCatalog,
	validateMigrationRouteProofEvidence,
} from "./route-proof-catalog.ts";
export type {
	MigrationRouteProofDimensionResult,
	MigrationRouteProofEvaluation,
	MigrationRouteProofSpec,
} from "./route-proof-catalog.ts";
export {
	REAL_REPOSITORY_PROOF_SCHEMA,
	classifyRealRepositoryProof,
} from "./real-repository-proof.ts";
export type {
	RealRepositoryProofDimensionEvidence,
	RealRepositoryProofInput,
	RealRepositoryPromotionEvidence,
} from "./real-repository-proof.ts";
export type {
	DifferentialMatrixCase,
	DifferentialMatrixCatalog,
	DifferentialMatrixProofProvider,
	DifferentialMatrixResult,
} from "./differential-matrix.ts";
export { STYLE_RECIPE_SCHEMA, resolveStyleRecipe } from "./recipe-ir.ts";
export type {
	ResolvedStyleRecipe,
	StyleRecipeCompoundVariant,
	StyleRecipeProgram,
	StyleRecipeSelection,
	StyleRecipeVariant,
} from "./recipe-ir.ts";
export {
	BuiltinHostFramework,
	detectHostFramework,
	getHostFrameworkAdapter,
	HOST_FRAMEWORK_REGISTRY,
	HOST_FRAMEWORK_PLUGINS,
	HOST_FRAMEWORK_PLUGIN_SCHEMA,
	HOST_FRAMEWORK_CONTRACT_SCHEMA,
	createHostFrameworkRegistry,
	createHostFrameworkContractSuite,
	canConvertStaticSolidJsx,
	rewriteSolidJsxToVue,
	canConvertStaticVueSfc,
	rewriteVueSfcToJsx,
} from "./host-adapters.ts";
export type {
	HostFramework,
	HostFrameworkAdapter,
	HostFrameworkContractFixture,
	HostFrameworkContractFailure,
	HostFrameworkContractResult,
	HostFrameworkContractSuite,
	HostFrameworkPlugin,
	HostFrameworkRegistry,
} from "./host-adapters.ts";
export {
	HOST_COMPILER_PLUGINS,
	HOST_COMPILER_SCHEMA,
	createHostCompilerPlugin,
} from "./host-compiler.ts";
export {
	getHostComponentRewriter,
	intrinsicTagForSubject,
	rewriteDynamicCarrier,
	rewriteDynamicExpressionCarrier,
	HOST_COMPONENT_REWRITER_SCHEMA,
} from "./host-component-rewriter.ts";
export type {
	HostComponentRewriteRequest,
	HostComponentRewriteResult,
	HostComponentRewriter,
	HostDynamicCarrierRewriteResult,
} from "./host-component-rewriter.ts";
export type {
	HostCompilerContext,
	HostCompilerDiagnostic,
	HostCompilerPlugin,
	HostCompilerResult,
} from "./host-compiler.ts";
export type {
	SemanticConditionKind,
	StyleCondition,
	StyleConditionOperator,
	StyleDeclaration,
	StyleDynamicValue,
	StyleStaticEvaluation,
	StyleDynamicLowering,
	StyleValueKind,
	StyleLiteralValue,
	StyleProgram,
	StyleProgramOptions,
	StyleProgramResidual,
	StyleProgramSource,
	StyleRule,
	StyleRuleInput,
	StyleRuleKind,
	StyleTokenValue,
	StyleValue,
} from "./semantic-ir.ts";
export type {
	AdapterCapabilities,
	AdapterCapability,
	AdapterCapabilityIssue,
	AdapterCapabilityLevel,
	AdapterCapabilityMode,
	AdapterCapabilityReport,
	ProgramCapabilityRequirement,
} from "./capabilities.ts";

export interface SwapOptions {
	from: SwapSource;
	to: SwapTarget;
	file: string;
	skipMarker?: string;
	metaDir?: string;
	/** Token-reference emission for value-capable targets (default "bare"). */
	tokenRefs?: TokenRefMode;
	/** Token spelling policy for references emitted by the flat route. */
	tokenReferenceFormat?: TokenReferenceFormatValue;
	/** Resolve bridge misses through the real Tailwind engine. */
	engineResolver?: (utilityClass: string) => readonly { prop: string; value: string }[] | null;
	/** Tokenize-this: rewrite verified raw values to token references (CSS sources). */
	tokenize?: boolean;
	/** Exact raw->token suggestions from a governance report (plans/054).
	 * When supplied with `tokenize`, ONLY suggested (property, rawValue) pairs
	 * are rewritten; the value-scan heuristic is bypassed. */
	suggestions?: ReadonlyArray<{
		file: string;
		start: number;
		end: number;
		property?: string;
		rawValue: string;
		tokenId: string;
		replacement: string;
		confidence: "verified" | "inferred" | "unknown";
	}>;
	/** Canonical property-order sorting in emitted scopes. */
	sort?: boolean;
	/** Add nearest preset-token candidates to raw-literal residual hints. */
	nearestTokens?: boolean;
	/** Hoist repeated identical literal call sites into module constants. */
	dedup?: boolean;
	/** Hoist all static Pandwind style calls to module scope when enabled. */
	hoistStaticStyles?: boolean;
	/** Optional source condition metadata supplied by a project adapter. */
	conditionKinds?: StyleProgramOptions["conditionKinds"];
	conditionValues?: StyleProgramOptions["conditionValues"];
	conditionRaw?: StyleProgramOptions["conditionRaw"];
	/** Contract override for a custom target adapter. */
	adapterCapabilities?: AdapterCapabilities;
	/** Enforce the declared contract when supplied. */
	capabilityMode?: AdapterCapabilityMode;
}

export interface SwapTransformResult {
	readonly code: string;
	readonly changed: boolean;
	/** Call sites converted through the registered source and target adapters. */
	readonly converted: number;
	/** Source values that remain visible because the route could not prove them. */
	readonly unmappedTokens: readonly { file: string; token: string; reason: string }[];
	readonly skippedByMarker: number;
	readonly capabilityReports: readonly AdapterCapabilityReport[];
}

interface Match {
	start: number;
	end: number;
	ir: SwapIR;
	/** Which parser produced this match ("tw" | "css" | "design"). */
	shape: "tw" | "css" | "design";
}

type MissResolver = (utilityClass: string) => readonly { prop: string; value: string }[] | null;

function collectMatches(
	source: string,
	from: SwapSource,
	meta: PandwindMeta,
	file: string,
	engineResolver?: MissResolver,
	tokenize?: boolean,
	suggestions?: SwapOptions["suggestions"],
): Array<Match> {
	if (from === CodemodAdapterId.Panda || builtinAdapterIds.includes(from)) return [];
	return [
		...SWAP_REGISTRY.scanSource(from, {
			source,
			file,
			meta,
			engineResolver,
			tokenize,
			suggestions,
		}),
	];
}

/** Run one swap pass over a file's source. */
export function runSwap(
	source: string,
	meta: PandwindMeta,
	options: SwapOptions,
): SwapTransformResult {
	const marker = options.skipMarker ?? "pandwind:migrate-skip";
	const file = options.file;
	const emitter = SWAP_REGISTRY.getTarget(options.to);
	if (emitter === undefined) throw new Error(`codemod migrate: unknown target '${options.to}'`);
	const matches = collectMatches(
		source,
		options.from,
		meta,
		file,
		options.engineResolver,
		options.tokenize,
		options.suggestions,
	);

	type Edit = { start: number; end: number; text: string };
	let code = source;
	const edits: Edit[] = [];
	const markerEdits: Edit[] = [];
	const residualsOut: Array<{ file: string; token: string; reason: string }> = [];
	let converted = 0;
	let skippedByMarker = 0;
	const capabilityReports: AdapterCapabilityReport[] = [];

	let siteIndex = 0;
	const tokenRefs: TokenRefMode = options.tokenRefs ?? "bare";
	const tokenReferenceFormat = options.tokenReferenceFormat ?? TokenReferenceFormat.Preserve;
	const headers: string[] = [];
	const imports: string[] = [];
	const addSkipMarker = (index: number, reason: string): void => {
		markerEdits.push(SourcePass.markerEdit(source, index, reason, marker, file));
	};
	for (const match of matches) {
		const { ir } = match;
		siteIndex += 1;
		const program = semanticProgramForMatch(source, match, file, options);
		const capabilities = options.adapterCapabilities ?? emitter.capabilities;
		const capabilityReport =
			capabilities === undefined
				? undefined
				: inspectAdapterCapabilities(capabilities, program, options.capabilityMode ?? "partial");
		if (capabilityReport !== undefined) {
			capabilityReports.push(capabilityReport);
			if (options.capabilityMode !== undefined && !capabilityReport.convertible) {
				const details = capabilityReport.blockers
					.map((issue) => `${issue.capability}: ${issue.detail}`)
					.join("; ");
				addSkipMarker(match.start, `${MigrationSkipReason.CapabilityBlocked}: ${details}`);
				skippedByMarker++;
				for (const issue of capabilityReport.blockers) {
					residualsOut.push({ file, token: issue.detail, reason: issue.level });
				}
				continue;
			}
		}
		// Only in-house class-string targets ride an existing pandwind css
		// binding; external libraries bring their own imports.
		const needsCssTarget =
			options.to === SwapTargetId.CssClass || options.to === SwapTargetId.Design;
		const needsDssTarget = options.to === SwapTargetId.Dss;
		const hasDssBinding =
			/\b(?:const|let|var)\s+dss\b/.test(code) || /import\s*\{[^}]*\bdss\b[^}]*}\s*from/.test(code);
		if ((needsCssTarget && !hasCssBinding(code)) || (needsDssTarget && !hasDssBinding)) {
			addSkipMarker(
				match.start,
				`${MigrationSkipReason.HostRewriteRequired}: no local ${needsDssTarget ? "dss" : "pandwind css"} instance to swap into (${options.to})`,
			);
			skippedByMarker++;
			continue;
		}
		const result = emitter.emit(ir, meta, {
			index: siteIndex,
			source,
			tokenRefs,
			sort: options.sort,
			program,
			capabilities,
			capabilityReport,
			nearestTokens: options.nearestTokens,
			tokenReferenceFormat,
		});
		if (result.headers !== undefined && result.headers.length > 0) headers.push(...result.headers);
		if (result.imports !== undefined && result.imports.length > 0) imports.push(...result.imports);
		if (result.text === "") {
			// Nothing representable — document why, keep the original.
			const emissionResiduals = [...ir.residuals, ...result.residuals];
			const hints = emissionResiduals.map((r) => r.hint ?? r.kind).join("; ");
			addSkipMarker(
				match.start,
				`${MigrationSkipReason.LoweringResidual}: ${hints || "unconvertible"}`,
			);
			skippedByMarker++;
			continue;
		}
		// A non-empty emission is not proof of a lossless conversion. Emitters
		// may have a useful partial rendering while still reporting semantics
		// they cannot represent. The pivot contract is fail-closed unless the
		// emitter explicitly marks a residual as preserved by a target carrier.
		const emissionResiduals = [...ir.residuals, ...result.residuals];
		const blockingResiduals = emissionResiduals.filter((residual) => residual.preserved !== true);
		if (blockingResiduals.length > 0) {
			const hints = blockingResiduals.map((residual) => residual.hint ?? residual.kind).join("; ");
			addSkipMarker(
				match.start,
				`${MigrationSkipReason.LoweringResidual}: ${hints || "unrepresentable semantics"}`,
			);
			skippedByMarker++;
			for (const residual of emissionResiduals) {
				residualsOut.push({
					file,
					token: residual.text,
					reason: residual.hint ?? residual.kind,
				});
			}
			continue;
		}
		edits.push({ start: match.start, end: match.end, text: result.text });
		converted++;
		for (const residual of emissionResiduals) {
			residualsOut.push({
				file,
				token: residual.text,
				reason: residual.hint ?? residual.kind,
			});
		}
	}

	if (edits.length > 0 || markerEdits.length > 0) {
		code = SourcePass.applyEdits(source, [...edits, ...markerEdits]);
		if (edits.length > 0) {
			for (const statement of imports) code = ensureImport(code, statement);
			if (headers.length > 0) {
				// Structural blocks (stylex.create) go after the import section.
				for (const header of headers) code = ensureImport(code, header);
			}
			// Target-import hygiene: tw targets need the app's generated tw module
			// unless the file already binds it; css.class/design ride the existing
			// css binding (gated above).
			if (
				options.to === SwapTargetId.Tw &&
				options.metaDir !== undefined &&
				options.metaDir !== ""
			) {
				if (
					!/\btw\s*\(/.test(
						code
							.split("\n")
							.filter((l) => l.startsWith("import"))
							.join("\n"),
					) &&
					!/(?:^|\n)\s*import\s*\{[^}]*\btw\b[^}]*\}\s*from/.test(code)
				) {
					code = ensureImport(
						code,
						`import { tw } from "${relativeModuleImport(file, options.metaDir, "tw")}";`,
					);
				}
			}
		}
	}

	if (options.to === SwapTargetId.CssClass && options.hoistStaticStyles === true)
		code = simplifyPandwindStaticStyles(code, file, { hoistStaticStyles: true }).code;
	if (options.dedup === true) code = dedupLiteralCallSites(code);

	return {
		code,
		changed: code !== source,
		converted,
		unmappedTokens: residualsOut,
		skippedByMarker,
		capabilityReports,
	};
}

function semanticProgramForMatch(
	source: string,
	match: Match,
	file: string,
	options: SwapOptions,
): StyleProgram {
	const programOptions: StyleProgramOptions = {
		source: { file, start: match.start, end: match.end, adapter: match.shape },
		conditionKinds: options.conditionKinds,
		conditionValues: options.conditionValues,
		conditionRaw: options.conditionRaw,
	};
	const hasDynamicSource = match.ir.residuals.some(
		(residual) => residual.kind === SwapResidualKindTag.Dynamic,
	);
	if (hasDynamicSource) {
		const open = source.indexOf("{", match.start);
		const block = open === -1 ? null : SourcePass.matchBlock(source, open);
		if (block !== null) {
			return styleProgramFromSourceObject(block.body, {
				...programOptions,
				sourceOffset: open + 1,
			});
		}
	}
	return styleProgramFromSwapIR(match.ir, programOptions);
}

/**
 * Dedup pass: identical literal `css.class({...})` / `tw({...})` call sites
 * appearing 2+ times hoist into one module constant placed after the import
 * section (ensureImport semantics); every occurrence references it.
 */
const DEDUP_CALL_REGEX = /\b(css\.class|tw)\(\{[^{}]*\}\)/g;

export function dedupLiteralCallSites(code: string): string {
	const counts = new Map<string, number>();
	for (const match of code.matchAll(DEDUP_CALL_REGEX)) {
		const key = `${match[1]}|${match[0]}`;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	const duplicates = [...counts.entries()].filter(([, n]) => n >= 2);
	if (duplicates.length === 0) return code;
	let working = code;
	duplicates.forEach(([key], i) => {
		const literal = key.slice(key.indexOf("|") + 1);
		const name = `pwStyle${i + 1}`;
		working = working.split(literal).join(name);
		working = ensureImport(working, `const ${name} = ${literal};`);
	});
	return working;
}
