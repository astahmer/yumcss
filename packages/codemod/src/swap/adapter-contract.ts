import type { PandwindMeta } from "../meta.ts";
import type {
	AdapterCapabilities,
	AdapterCapability,
	AdapterCapabilityMode,
	AdapterCapabilityReport,
} from "./capabilities.ts";
import type {
	StyleComposition,
	StylePluginTransform,
	StyleProgram,
	StyleProgramOptions,
	StyleProgramResidual,
	StyleRuntimeContext,
	StyleThemeBinding,
} from "./semantic-ir.ts";
import type { SourceBinding, SourceBindingIndex, SourceScanResult } from "pandwind/source";
import type { StyleLowering, StyleLoweringPlan } from "./lowering.ts";
import type {
	StyleHostRepresentationKind,
	StyleMigrationOutcome,
	StyleRepresentationKind,
	StyleUtilityDecisionReason,
	StyleUtilityRepresentationKind,
} from "./identifiers.ts";
import type { HostFramework } from "./host-adapters.ts";
import type {
	AdapterConfigEvidence,
	AdapterGeneratedArtifactEvidence,
	AdapterOfficialApiManifest,
	AdapterPluginChain,
} from "./adapter-evidence.ts";
import type { TokenReferenceFormat } from "./tokens.ts";

/** Versioned source/target adapter protocol for the migration pivot. */
export const ADAPTER_CONTRACT_SCHEMA = "pandwind.style-adapter/3" as const;

export type AdapterDependencyKind = `${AdapterDependencyKindTag}`;

export const enum AdapterDependencyKindTag {
	Runtime = "runtime",
	Development = "development",
	Peer = "peer",
	Config = "config",
}

export interface AdapterDependency {
	readonly name: string;
	readonly range?: string;
	readonly kind: AdapterDependencyKind;
}

export interface AdapterDependencies {
	readonly packages: readonly AdapterDependency[];
	readonly files?: readonly string[];
}

/** Target-owned project-relative source file emitted with a migration. */
export interface AdapterGeneratedFile {
	readonly path: string;
	readonly content: string;
	readonly purpose?: string;
}

export interface AdapterDetectionContext {
	readonly file: string;
	readonly source: string;
	readonly root?: string;
	readonly packageJson?: Readonly<Record<string, unknown>>;
	/** Optional filesystem port for project-aware detection (for example JSX config). */
	readonly readFile?: (file: string) => string | undefined;
}

export interface AdapterDetectionResult {
	readonly matched: boolean;
	readonly confidence: number;
	readonly evidence: readonly string[];
}

export interface AdapterProjectConfig {
	readonly adapter: string;
	readonly root?: string;
	readonly files: readonly string[];
	readonly values: Readonly<Record<string, unknown>>;
	/**
	 * Normalized named conditions discovered by the owning config loader.
	 * Targets can consume this catalog without knowing which ecosystem produced it.
	 */
	readonly conditionCatalog?: AdapterConditionCatalog;
	/**
	 * Normalized design-token values discovered by the owning config loader.
	 * The catalog is deliberately neutral; each target adapter decides whether
	 * a verified match can be emitted in its native token syntax.
	 */
	readonly tokenCatalog?: AdapterTokenCatalog;
	/** Authored raw and semantic token trees used to build the target preset. */
	readonly tokenDefinitions?: AdapterTokenDefinitions;
	/** Configuration-loading failures are semantic residuals, never silent fallback. */
	readonly residuals?: readonly StyleProgramResidual[];
	/** Ordered evidence for how project semantics were resolved. */
	readonly configuration?: readonly AdapterConfigEvidence[];
	/** Configured source plugin chain; incomplete chains are not silently flattened. */
	readonly plugins?: AdapterPluginChain;
	/** Generated artifacts that are authoritative over source re-interpretation. */
	readonly artifacts?: readonly AdapterGeneratedArtifactEvidence[];
}

/** Effective source-module ownership after reading project configuration. */
export interface AdapterSourceModuleOwnership {
	readonly modules: readonly string[];
	readonly matchers?: readonly ((moduleSpecifier: string) => boolean)[];
	/** Match an authored alias to the corresponding documented entry point. */
	readonly semanticMatchers?: readonly ((
		actualSource: string,
		expectedSource: string,
	) => boolean)[];
}

type AdapterConditionValue = string | readonly string[];
export type AdapterConditionCatalog = Readonly<Record<string, AdapterConditionValue>>;

/** Project-owned modules shared by generated target code. Paths are root-relative. */
export interface AdapterProjectBindings {
	/** Module exporting the extracted/static `css` binding. */
	readonly cssModule?: string;
	/** Module exporting the configured React Stack binding. */
	readonly stackModule?: string;
	/** Module exporting the runtime CSS binding for dynamic/global rules. */
	readonly runtimeCssModule?: string;
	/** Exported name of the runtime CSS binding in `runtimeCssModule`. */
	readonly runtimeCssBinding?: string;
	/** Module exporting the project-configured design-system `dss` binding. */
	readonly dssModule?: string;
	/** Module exporting the project-configured `tw` binding. */
	readonly twModule?: string;
	/** Module exporting the shared `cx` binding. */
	readonly cxModule?: string;
}

/**
 * Project configuration is an adapter port, not a central config parser.
 * Implementations may synchronously inspect source or asynchronously evaluate
 * the ecosystem's official loader from the host project's root. The async
 * result must retain provenance and publish failures as configuration
 * residuals; callers must never substitute a guessed ecosystem default.
 */
export interface AdapterConfigGraphPort {
	loadConfig(context: AdapterConfigContext): AdapterProjectConfig;
	loadConfigAsync?(context: AdapterConfigContext): Promise<AdapterProjectConfig>;
}

export const ADAPTER_TOKEN_CATALOG_SCHEMA = "pandwind.adapter-token-catalog/1" as const;
export const ADAPTER_TOKEN_POLICY_SCHEMA = "pandwind.adapter-token-policy/1" as const;
export const ADAPTER_TOKEN_DEFINITIONS_SCHEMA = "pandwind.adapter-token-definitions/1" as const;

export interface AdapterTokenCatalog {
	readonly schema: typeof ADAPTER_TOKEN_CATALOG_SCHEMA;
	/** group -> authored token key -> resolved value */
	readonly groups: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export interface AdapterTokenDefinitions {
	readonly schema: typeof ADAPTER_TOKEN_DEFINITIONS_SCHEMA;
	/** Authored raw token tree, before flattening or semantic resolution. */
	readonly raw: Readonly<Record<string, unknown>>;
	/** Authored semantic token tree, including condition branches. */
	readonly semantic: Readonly<Record<string, unknown>>;
}

export interface AdapterConfigContext extends AdapterDetectionContext {
	readonly readFile?: (file: string) => string | undefined;
	/** Optional project filesystem port used to discover the effective config graph. */
	readonly listFiles?: (root: string) => readonly string[];
}

export interface AdapterParseContext extends AdapterDetectionContext {
	readonly config: AdapterProjectConfig;
	/** Effective source modules resolved from the owning adapter configuration. */
	readonly sourceModules?: readonly string[];
	readonly sourceModuleMatchers?: readonly ((moduleSpecifier: string) => boolean)[];
	readonly sourceModuleSemanticMatchers?: readonly ((
		actualSource: string,
		expectedSource: string,
	) => boolean)[];
	/** Target route used when source normalization has target-specific semantics. */
	readonly targetId?: string;
	/** AST-owned import/reference facts from the shared source scanner. */
	readonly bindings?: SourceBindingIndex;
	/** Resolve a local binding through relative project re-export barrels. */
	readonly resolveBinding?: (localName: string) => SourceBinding | undefined;
	readonly meta?: PandwindMeta;
	/** Optional language-neutral document view supplied by the scanner registry. */
	readonly document?: SourceScanResult;
	/** Source semantic metadata supplied by a framework or project integration. */
	readonly semantic?: Pick<
		StyleProgramOptions,
		"source" | "themes" | "compositions" | "runtime" | "plugins"
	> & {
		readonly themes?: readonly StyleThemeBinding[];
		readonly compositions?: readonly StyleComposition[];
		readonly runtime?: StyleRuntimeContext;
		readonly plugins?: readonly StylePluginTransform[];
	};
}

export interface AdapterMatch {
	readonly start: number;
	readonly end: number;
	readonly program: StyleProgram;
	readonly sourceText: string;
}

export interface AdapterParseResult {
	readonly matches: readonly AdapterMatch[];
	readonly residuals: readonly StyleProgramResidual[];
}

export interface AdapterEmitContext {
	readonly file: string;
	readonly config: AdapterProjectConfig;
	readonly sourceConfig?: AdapterProjectConfig;
	readonly mode: AdapterCapabilityMode;
	readonly capability?: AdapterCapabilityReport;
	/** Residuals produced by generic lowering before target emission. */
	readonly loweringResiduals?: readonly StyleProgramResidual[];
	readonly index: number;
	readonly meta?: PandwindMeta;
	/** Optional language-neutral document view for target emitters. */
	readonly document?: SourceScanResult;
	/** Source-owned modules whose imports are removed after target emission. */
	readonly sourceModules?: readonly string[];
	/** Source-owned module patterns whose imports are removed after target emission. */
	readonly sourceModuleMatchers?: readonly ((moduleSpecifier: string) => boolean)[];
	/** Token spelling policy selected for this migration. */
	readonly tokenReferenceFormat?: TokenReferenceFormat;
	/** Shared target modules prepared by a project migration. */
	readonly project?: AdapterProjectBindings;
	/** Host binding context for adapters that emit framework wrappers. */
	readonly host?: {
		readonly binding?: string;
		readonly framework?: string;
		readonly subject?: string;
		readonly subjectAttrs?: string;
		readonly stableClassName?: string;
		/** Target-owned representation selected for this host projection. */
		readonly representation?: StyleHostRepresentationKind;
		/** Target-owned semantic carrier selected for this emission. */
		readonly representationKind?: StyleRepresentationKind;
	};
}

/**
 * Target-owned token preservation. Source adapters only provide semantic
 * values; this port decides if a target's verified config can recover a
 * native token reference without changing CSS meaning.
 */
export interface AdapterTokenPolicy {
	readonly schema: typeof ADAPTER_TOKEN_POLICY_SCHEMA;
	preserve(program: StyleProgram, context: AdapterEmitContext): StyleProgram;
}

/** Typed evidence for the target utility spelling selected by an emitter. */
export interface AdapterEmissionDecision {
	readonly representation: StyleUtilityRepresentationKind;
	readonly candidate: string;
	readonly property: string;
	readonly value: string | number;
	readonly verified: boolean;
	readonly reason: StyleUtilityDecisionReason;
	readonly contextFingerprint?: string;
}

export interface AdapterEmitResult {
	readonly text: string;
	/** Semantic observation for opaque runtime registration or an intentional portable artifact. */
	readonly semantic?: StyleProgram;
	readonly imports?: readonly string[];
	/** Module-level statements required by an emitted expression. */
	readonly generatedStatements?: readonly string[];
	readonly dependencies?: AdapterDependencies;
	readonly generatedFiles?: readonly AdapterGeneratedFile[];
	readonly emissionDecisions?: readonly AdapterEmissionDecision[];
	/** Residual source tokens retained by an explicit target carrier. */
	readonly preservedResiduals?: readonly StyleProgramResidual[];
	readonly residuals: readonly StyleProgramResidual[];
}

export interface AdapterDynamicPreparationContext {
	readonly source: string;
	readonly file: string;
	readonly targetId: string;
	readonly program: StyleProgram;
	readonly binding?: string;
	readonly framework?: string;
}

export interface AdapterDynamicPreparation {
	readonly handled: boolean;
	readonly standalone?: boolean;
}

export interface AdapterHostRewriteContext {
	readonly source: string;
	readonly code: string;
	readonly file: string;
	readonly targetId: string;
	/** Source adapter-owned runtime modules that may become removable after host conversion. */
	readonly sourceModules: readonly string[];
	readonly program: StyleProgram;
	readonly emittedExpression: string;
	readonly binding?: string;
	readonly framework?: string;
	/** Source host dialect before a target-owned host conversion. */
	readonly sourceFramework?: HostFramework;
	readonly representation: StyleHostRepresentationKind;
	/** Semantic carrier selected for the emitted style value. */
	readonly representationKind?: StyleRepresentationKind;
	/** Lowering residuals that a target carrier may explicitly preserve. */
	readonly residuals?: readonly StyleProgramResidual[];
}

export interface AdapterHostFrameworkConversion {
	/** Source host dialect that this target can translate. */
	readonly from: HostFramework;
	/** Target host dialect produced by the rewrite. */
	readonly to: HostFramework;
	/** Guard the conversion when source syntax contains framework-only behavior. */
	readonly canConvert?: (context: {
		readonly file: string;
		readonly source: string;
		readonly program: StyleProgram;
	}) => boolean;
	/** Optional whole-document dialect projection after style call lowering. */
	readonly rewriteDocument?: (
		context: AdapterHostDocumentRewriteContext,
	) => AdapterHostDocumentRewriteResult;
}

export interface AdapterHostDocumentRewriteContext {
	readonly source: string;
	readonly code: string;
	readonly file: string;
	readonly targetId: string;
	readonly sourceFramework: HostFramework;
	readonly targetFramework: HostFramework;
	readonly convertedBindings: ReadonlySet<string>;
}

export interface AdapterHostDocumentRewriteResult {
	readonly code: string;
	readonly imports?: readonly string[];
	readonly residuals: readonly StyleProgramResidual[];
	/** Target extension when the dialect projection changes the file language. */
	readonly outputExtension?: string;
}

export interface AdapterHostRewriteResult {
	readonly code: string;
	readonly imports?: readonly string[];
	/** Modules made unreachable by a target-owned host conversion. */
	readonly removeSourceModules?: readonly string[];
	/** Factory-qualified host tags this rewrite collapsed to their canonical intrinsic element. */
	readonly demotedFactoryHosts?: readonly string[];
	readonly residuals: readonly StyleProgramResidual[];
}

export interface AdapterComponentRewriteContext {
	readonly source: string;
	readonly code: string;
	readonly file: string;
	readonly targetId: string;
	readonly program: StyleProgram;
	readonly binding: string;
	readonly tag: string;
	readonly framework: string;
	/** Source host dialect before a target-owned host conversion. */
	readonly sourceFramework?: HostFramework;
	readonly emittedExpression: string;
	readonly representation: StyleHostRepresentationKind;
}

export interface AdapterComponentRewriteResult {
	readonly code: string;
	readonly imports?: readonly string[];
	readonly residuals: readonly StyleProgramResidual[];
}

export interface AdapterRewriteContext {
	readonly source: string;
	readonly code: string;
	readonly file: string;
	readonly targetId: string;
	readonly sourceConfig?: AdapterProjectConfig;
	/** Shared target modules prepared by the project bootstrap. */
	readonly project?: AdapterProjectBindings;
	readonly convertedBindings: ReadonlySet<string>;
	readonly complete: boolean;
}

export interface AdapterRewriteResult {
	readonly code: string;
	readonly imports?: readonly string[];
	readonly residuals: readonly StyleProgramResidual[];
	/** Source residuals fully handled by this target-aware whole-file rewrite. */
	readonly handledResiduals?: readonly StyleProgramResidual[];
}

export interface AdapterMigrationHooks {
	/** Optional whole-file projection for stylesheet sources whose extension changes. */
	readonly file?: AdapterFileMigration;
	prepareDynamic?(context: AdapterDynamicPreparationContext): AdapterDynamicPreparation;
	rewrite?(context: AdapterRewriteContext): AdapterRewriteResult;
	targetPolicy?: AdapterTargetMigrationPolicy;
}

export interface AdapterFileMigrationContext {
	readonly source: string;
	readonly file: string;
	readonly root?: string;
	readonly target: StyleAdapter;
	readonly sourceConfig: AdapterProjectConfig;
	readonly targetConfig: AdapterProjectConfig;
	readonly readFile?: (file: string) => string | undefined;
	readonly listFiles?: (root: string) => readonly string[];
}

export interface AdapterFileMigrationResult {
	readonly code: string;
	readonly outputExtension?: string;
	readonly changed: boolean;
	readonly converted: number;
	readonly skipped: number;
	readonly generatedFiles: readonly AdapterGeneratedFile[];
	/** Compiler-produced source maps retained as parity evidence. */
	readonly sourceMaps?: readonly string[];
	/** Existing project files rewritten atomically with the migrated source. */
	readonly fileChanges?: readonly AdapterFileChange[];
	readonly residuals: readonly StyleProgramResidual[];
	readonly dependencies: readonly AdapterDependencies[];
	/** Canonical source/target parity evidence produced by the migration itself. */
	readonly validations?: readonly AdapterValidationResult[];
	/** One inspectable representation decision for each converted source rule. */
	readonly loweringPlans: readonly StyleLoweringPlan[];
	/** Final, validated outcome for each converted rule; the runner derives it when absent. */
	readonly outcomes?: readonly AdapterMigrationOutcome[];
}

/** One final, validated outcome for a converted style construct. */
export interface AdapterMigrationOutcome {
	readonly sourceStart: number;
	readonly sourceText: string;
	readonly outcome: StyleMigrationOutcome;
	readonly representation: StyleRepresentationKind;
	readonly detail?: string;
}

export interface AdapterFileChange {
	readonly path: string;
	readonly content: string;
	/** Optional source content used to detect a stale workspace before writing. */
	readonly expectedContent?: string;
}

export interface AdapterFileMigration {
	run(context: AdapterFileMigrationContext): AdapterFileMigrationResult;
	/** Optional official-compiler path used by project-aware async migrations. */
	runAsync?(context: AdapterFileMigrationContext): Promise<AdapterFileMigrationResult>;
}

export interface AdapterTargetMigrationPolicy {
	readonly handlesHostRewrites?: boolean;
	/**
	 * Opt into the shared static CSS-variable carrier for scalar dynamic values
	 * attached to a React/Preact class host. The adapter factory composes the
	 * representation and host rewrite; adapters still own whether this carrier
	 * is valid for their emitted class API.
	 */
	readonly dynamicClassCarrier?: boolean;
	/** Target cannot represent a standalone style value without a host use. */
	readonly requiresHostContext?: boolean;
	/** Target-owned explanation for a missing required host use. */
	readonly hostContextRequiredHint?: string;
	/** Whether host-bound components become a class carrier or a target component wrapper. */
	readonly hostRepresentation?: StyleHostRepresentationKind;
	/** Select a target representation from the normalized program and host use. */
	readonly resolveHostRepresentation?: (context: {
		readonly program: StyleProgram;
		readonly hasHostContext: boolean;
		readonly framework?: string;
		/** Source host dialect before a target-owned host conversion. */
		readonly sourceFramework?: HostFramework;
		/** Source text used by the target adapter to validate host ownership. */
		readonly source?: string;
		/** Source binding whose host use is being projected. */
		readonly binding?: string;
	}) => StyleHostRepresentationKind | undefined;
	/**
	 * Select a semantic carrier independently from the host shape. A target can
	 * use this port to opt into a portable static artifact when its native API
	 * is unavailable, without adding a target-specific branch to the runner.
	 */
	readonly resolveRepresentation?: (context: {
		readonly program: StyleProgram;
		/** Representation selected by generic lowering before target negotiation. */
		readonly representation?: StyleRepresentationKind;
		/** Target contract used by shared representation projections. */
		readonly targetCapabilities?: AdapterCapabilities;
		readonly hasHostContext: boolean;
		readonly framework?: string;
		/** Source host dialect before a target-owned host conversion. */
		readonly sourceFramework?: HostFramework;
		readonly binding?: string;
		readonly hostRepresentation?: StyleHostRepresentationKind;
		/** Original source used to preflight host rewrites before lowering. */
		readonly source?: string;
	}) => StyleRepresentationKind | undefined;
	/** Capabilities satisfied by the selected target-owned representation. */
	readonly capabilitiesForRepresentation?: (context: {
		readonly program: StyleProgram;
		readonly representation: StyleRepresentationKind;
	}) => readonly AdapterCapability[];
	/** Residual kinds represented by the selected target carrier and host rewrite. */
	readonly preservesResidualKindsForRepresentation?: (context: {
		readonly program: StyleProgram;
		readonly representation: StyleRepresentationKind;
	}) => readonly string[];
	/** Representation to use when a styled intrinsic is exported as a component itself. */
	readonly standaloneHostRepresentation?: StyleHostRepresentationKind;
	/** Host rewrites consume framework metadata when emitting an intrinsic host. */
	readonly handlesFrameworkSemantics?: boolean;
	/** Frameworks whose component syntax the target adapter can preserve natively. */
	readonly hostFrameworks?: readonly HostFramework[];
	/** Explicit source-to-target host dialect rewrites owned by this target. */
	readonly hostFrameworkConversions?: readonly AdapterHostFrameworkConversion[];
	/** Whether rewriteHost consumes source host style attributes in addition to the carrier. */
	readonly handlesSourceHostAttributes?: boolean;
	/** Whether this target can preserve scalar runtime expressions in its native style carrier. */
	readonly handlesDynamicValues?: boolean;
	/**
	 * Whether a source-adapter factory host (for example a JSX factory member) may
	 * be collapsed to its canonical element when this target owns the style
	 * carrier. Defaults to true: a replacement target cannot call a foreign
	 * factory. A compose target such as Pandwind wraps any source host and opts
	 * out so the source factory keeps styling the element it was authored on.
	 */
	readonly demotesFactoryHosts?: boolean;
	/** Whether its component rewrite can preserve scalar runtime expressions. */
	readonly handlesDynamicComponentValues?: boolean;
	/** Target-owned rewrite for representations attached to a host prop. */
	readonly rewriteHost?: (context: AdapterHostRewriteContext) => AdapterHostRewriteResult;
	/** Optional target-owned finalization after a shared class-host projection. */
	readonly postRewriteHost?: (context: AdapterHostRewriteContext) => AdapterHostRewriteResult;
	/** Target-owned rewrite for styled subjects that become intrinsic hosts. */
	readonly rewriteComponent?: (
		context: AdapterComponentRewriteContext,
	) => AdapterComponentRewriteResult;
	readonly requiresHostWrapper?: (context: { source: string; binding: string }) => boolean;
	readonly handlesRawTemplate?: (context: { source: string }) => boolean;
	readonly handlesTemplateFragment?: (program: StyleProgram) => boolean;
}

export type AdapterLossiness = "lossless" | "lossy" | "unsupported";

export const enum AdapterLossinessTag {
	Lossless = "lossless",
	Lossy = "lossy",
	Unsupported = "unsupported",
}

export interface AdapterValidationResult {
	readonly valid: boolean;
	readonly lossiness: AdapterLossiness;
	readonly canonicalSource: string;
	readonly canonicalTarget: string;
	readonly differences: readonly string[];
	readonly residuals: readonly StyleProgramResidual[];
}

export interface StyleAdapter extends AdapterConfigGraphPort {
	readonly schema: typeof ADAPTER_CONTRACT_SCHEMA;
	readonly id: string;
	readonly version: string;
	/** Package entry points this adapter owns and may remove during migration. */
	readonly sourceModules: readonly string[];
	/** Optional target-specific source modules to remove after a complete migration. */
	readonly sourceModulesToRemove?: (targetId: string) => readonly string[];
	/** Adapter-owned matcher for project-local aliases of those entry points. */
	readonly sourceModuleMatchers?: readonly ((moduleSpecifier: string) => boolean)[];
	/** Resolve configured aliases without embedding project-specific names in the runner. */
	readonly resolveSourceModuleOwnership?: (
		config: AdapterProjectConfig,
	) => AdapterSourceModuleOwnership;
	readonly capabilities: AdapterCapabilities;
	readonly dependencies: AdapterDependencies;
	/** Documentation-driven source surface owned by this adapter. */
	readonly officialApi: AdapterOfficialApiManifest;
	/** Optional target-owned policy for verified custom-token recovery. */
	readonly tokenPolicy?: AdapterTokenPolicy;
	/** Adapter-owned semantic strategies; the runner only composes these ports. */
	readonly lowerings?: readonly StyleLowering[];
	readonly migration?: AdapterMigrationHooks;
	detect(context: AdapterDetectionContext): AdapterDetectionResult;
	parse(source: string, context: AdapterParseContext): AdapterParseResult;
	emit(program: StyleProgram, context: AdapterEmitContext): AdapterEmitResult;
	validate(
		source: StyleProgram,
		target: StyleProgram,
		residuals?: readonly StyleProgramResidual[],
	): AdapterValidationResult;
}
