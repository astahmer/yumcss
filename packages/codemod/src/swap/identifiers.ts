/**
 * Built-in codemod identifiers.
 *
 * Third-party adapters may still use branded runtime identifiers created by a
 * plugin, but built-ins must use these values everywhere. This keeps the
 * composition root and adapter contracts independent from spelling mistakes.
 */
export const enum CodemodAdapterId {
	Pandwind = "pandwind",
	Panda = "panda",
	StyleX = "stylex",
	ReactStrictDom = "react-strict-dom",
	Emotion = "emotion",
	StyledComponents = "styled-components",
	VanillaExtract = "vanilla-extract",
	Stitches = "stitches",
	Linaria = "linaria",
	Jss = "jss",
	Fela = "fela",
	Goober = "goober",
	Aphrodite = "aphrodite",
	Treat = "treat",
	Compiled = "compiled",
	ChakraUi = "chakra-ui",
	Mui = "mui",
	Mantine = "mantine",
	NextYak = "next-yak",
	Bamboo = "bamboo",
	Style9 = "style9",
	SolidStyled = "solid-styled",
	VueStyled = "vue-styled",
	ReactNative = "react-native",
	Tailwind = "tailwind",
	Tokenami = "tokenami",
	UnoCSS = "unocss",
	Tamagui = "tamagui",
	CssModules = "css-modules",
	Sass = "sass",
	Less = "less",
	AuthoredCss = "authored-css",
}

export const BUILTIN_CODEMOD_ADAPTER_IDS = [
	CodemodAdapterId.Pandwind,
	CodemodAdapterId.Panda,
	CodemodAdapterId.StyleX,
	CodemodAdapterId.ReactStrictDom,
	CodemodAdapterId.Emotion,
	CodemodAdapterId.StyledComponents,
	CodemodAdapterId.VanillaExtract,
	CodemodAdapterId.Stitches,
	CodemodAdapterId.Linaria,
	CodemodAdapterId.Jss,
	CodemodAdapterId.Fela,
	CodemodAdapterId.Goober,
	CodemodAdapterId.Aphrodite,
	CodemodAdapterId.Treat,
	CodemodAdapterId.Compiled,
	CodemodAdapterId.ChakraUi,
	CodemodAdapterId.Mui,
	CodemodAdapterId.Mantine,
	CodemodAdapterId.NextYak,
	CodemodAdapterId.Bamboo,
	CodemodAdapterId.Style9,
	CodemodAdapterId.SolidStyled,
	CodemodAdapterId.VueStyled,
	CodemodAdapterId.ReactNative,
	CodemodAdapterId.Tailwind,
	CodemodAdapterId.Tokenami,
	CodemodAdapterId.UnoCSS,
	CodemodAdapterId.Tamagui,
	CodemodAdapterId.CssModules,
	CodemodAdapterId.Sass,
	CodemodAdapterId.Less,
	CodemodAdapterId.AuthoredCss,
] as const;

export const enum CodemodPatternId {
	CssTemplate = "css-template",
	TokenamiCompose = "tokenami-compose",
	StyleXCreate = "stylex-create",
	StyleXKeyframes = "stylex-keyframes",
	StyleXDefineVars = "stylex-define-vars",
	ReactStrictDomCreate = "react-strict-dom-create",
	ReactStrictDomKeyframes = "react-strict-dom-keyframes",
	ReactStrictDomDefineVars = "react-strict-dom-define-vars",
	ReactStrictDomCompat = "react-strict-dom-compat",
	RuntimeSemanticRules = "runtime-semantic-rules",
	VanillaExtractGlobalStyle = "globalStyle",
	PandwindRecipe = "pandwind-recipe",
	PandwindSlotRecipe = "pandwind-slot-recipe",
}

export const enum CodemodCallPatternKindTag {
	Style = "style",
	Styled = "styled",
	Keyframes = "keyframes",
	Global = "global",
	FontFace = "font-face",
}

export const enum CodemodCallPatternFormTag {
	Object = "object",
	Template = "template",
	Reference = "reference",
	JsxStyle = "jsx-style",
	JsxGlobal = "jsx-global",
	Residual = "residual",
}

/** Stable capability identities used by manifests, ledgers, and validators. */
export const enum AdapterCapabilityTag {
	Declarations = "declarations",
	TokenValues = "token-values",
	CustomProperties = "custom-properties",
	DynamicValues = "dynamic-values",
	FunctionValues = "function-values",
	NamedConditions = "named-conditions",
	NamedRules = "named-rules",
	PseudoConditions = "pseudo-conditions",
	SelectorConditions = "selector-conditions",
	MediaConditions = "media-conditions",
	ContainerConditions = "container-conditions",
	SupportsConditions = "supports-conditions",
	RuleLevel = "rule-level",
	GlobalRules = "global-rules",
	Keyframes = "keyframes",
	FontFace = "font-face",
	Layers = "layers",
	SupportsRules = "supports-rules",
	PropertyRules = "property-rules",
	Selectors = "selectors",
	Nesting = "nesting",
	Ordering = "ordering",
	Recipes = "recipes",
	Components = "components",
	HostFramework = "host-framework",
	Ssr = "ssr",
	Hydration = "hydration",
	BrowserDifferential = "browser-differential",
	ThemeContext = "theme-context",
	Composition = "composition",
	RuntimeContext = "runtime-context",
	PluginTransforms = "plugin-transforms",
	FrameworkSemantics = "framework-semantics",
}

/** Built-in source dialects accepted by the flat SwapIR path. */
export const enum SwapSourceId {
	Auto = "auto",
	Css = "css",
	Design = "design",
	Dss = "dss",
	Tw = "tw",
}

export const enum SwapTargetId {
	CssClass = "css.class",
	Design = "design",
	Dss = "dss",
	Tw = "tw",
	Tailwind = "tailwind",
}

export const enum CodemodPluginId {
	BuiltinAdapters = "pandwind-builtin-adapters",
}

/** Resolution evidence for project configuration, ordered by authority. */
export const enum AdapterConfigEvidenceSourceTag {
	OfficialLoader = "official-loader",
	GeneratedArtifact = "generated-artifact",
	ProjectSourceFallback = "project-source-fallback",
	Unresolved = "unresolved",
}

export const enum AdapterEvidenceStatusTag {
	Resolved = "resolved",
	Failed = "failed",
	NotAttempted = "not-attempted",
}

export const enum AdapterPluginResolutionTag {
	Resolved = "resolved",
	Unresolved = "unresolved",
}

export const enum AdapterOfficialApiStatusTag {
	Supported = "supported",
	Deprecated = "deprecated",
	Internal = "internal",
	CompatibilityOnly = "compatibility-only",
}

export const enum StyleProgramEmissionHint {
	GlobalVariables = "global-variables",
	RuntimeClass = "runtime-class",
	RuntimeFunction = "runtime-function",
	Recipe = "recipe",
	RawTemplate = "raw-template",
}

/** Target utility forms selected after semantic lowering and verification. */
export const enum StyleUtilityRepresentationKind {
	Token = "token",
	PropertyAware = "property-aware",
	ArbitraryProperty = "arbitrary-property",
}

/** Why a target utility representation was selected or conservatively rejected. */
export const enum StyleUtilityDecisionReason {
	ExactToken = "exact-token",
	VerifiedPropertyAware = "verified-property-aware",
	AmbiguousNamespace = "ambiguous-namespace",
	CustomProperty = "custom-property",
	OfficialVerificationUnavailable = "official-verification-unavailable",
	CanonicalCssMismatch = "canonical-css-mismatch",
	UnsupportedValue = "unsupported-value",
}

/** Stable generated identities for declarations that need a reusable class name. */
export class CodemodStyleIdentity {
	static className(file: string, binding: string): string {
		let hash = 5381;
		for (const character of `${file}\0${binding}`) hash = (hash * 33) ^ character.charCodeAt(0);
		return `pw-${(hash >>> 0).toString(36)}`;
	}
}

export const enum StyleProgramConditionOrder {
	Authored = "authored",
	Depth = "depth",
}

/** Syntax shape retained for dynamic lowering and host-specific rewrites. */
export const enum StyleDynamicExpressionKind {
	Identifier = "identifier",
	Member = "member",
	Call = "call",
	Function = "function",
	Template = "template",
	Conditional = "conditional",
	Binary = "binary",
	Object = "object",
	Array = "array",
	Unknown = "unknown",
}

/** Semantic composition kinds shared by source and target adapters. */
export const enum StyleProgramCompositionKind {
	Mixin = "mixin",
	Extends = "extends",
	Recipe = "recipe",
	Slot = "slot",
}

export const enum StyleValidatorId {
	CanonicalCss = "canonical-css",
	Residuals = "residuals",
	BrowserStates = "browser-states",
	SsrHydration = "ssr-hydration",
	Dependencies = "dependencies",
	RscStreaming = "rsc-streaming",
	Builtin = "pandwind-core-validators",
}

export const BUILTIN_STYLE_VALIDATOR_IDS = [
	StyleValidatorId.CanonicalCss,
	StyleValidatorId.Residuals,
	StyleValidatorId.BrowserStates,
	StyleValidatorId.SsrHydration,
	StyleValidatorId.Dependencies,
	StyleValidatorId.RscStreaming,
	StyleValidatorId.Builtin,
] as const;

export const enum StyleLoweringId {
	TokenFallback = "token-fallback",
	DynamicAndTheme = "dynamic-and-theme",
	CompositionFlatten = "composition-flatten",
	RuntimeAndPlugin = "runtime-and-plugin",
	StyleXNumericNormalization = "stylex-numeric-normalization",
	ReactNativeNumericNormalization = "react-native-numeric-normalization",
	Builtin = "pandwind-core-lowerings",
}

/** Typed causes used by the source-preserving migration diagnostics. */
export const enum MigrationSkipReason {
	CapabilityBlocked = "capability-blocked",
	ParseResidual = "parse-residual",
	LoweringResidual = "lowering-residual",
	HostRewriteRequired = "host-rewrite-required",
	ConfigurationResidual = "configuration-residual",
}

/** Ordered semantic representations negotiated by the lowering planner. */
export const enum StyleRepresentationKind {
	Static = "static",
	NamedMap = "named-map",
	TargetNative = "target-native",
	CustomProperty = "custom-property",
	RuntimeCarrier = "runtime-carrier",
	PortableArtifact = "portable-artifact",
	Residual = "residual",
}

/** Stable route-level result after lowering, host rewrites, and validation. */
export const enum StyleMigrationOutcome {
	Static = "static",
	TargetNative = "target-native",
	HostRuntime = "host-runtime",
	PortableArtifact = "portable-artifact",
	Residual = "residual",
}

/** How a target adapter materializes a source component when host rewriting is needed. */
export const enum StyleHostRepresentationKind {
	Class = "class",
	Component = "component",
	StyleProp = "style-prop",
}

/** Target-owned strategy for preserving named style object return shapes. */
export const enum StyleNamedRuleStrategy {
	NativeMap = "native-map",
	ClassMap = "class-map",
	Unsupported = "unsupported",
}

/** Independent evidence dimensions used by real-repository promotion reports. */
export const enum RealRepositoryProofDimension {
	CanonicalCss = "canonical-css",
	Typecheck = "typecheck",
	Build = "build",
	BrowserStates = "browser-states",
	SsrHydration = "ssr-hydration",
	RscStreaming = "rsc-streaming",
	Dependencies = "dependencies",
	CssSize = "css-size",
}

/** Ordered dimensions used when a capability ledger is rendered or serialized. */
export const REAL_REPOSITORY_PROOF_DIMENSIONS = [
	RealRepositoryProofDimension.CanonicalCss,
	RealRepositoryProofDimension.Typecheck,
	RealRepositoryProofDimension.Build,
	RealRepositoryProofDimension.BrowserStates,
	RealRepositoryProofDimension.SsrHydration,
	RealRepositoryProofDimension.RscStreaming,
	RealRepositoryProofDimension.Dependencies,
	RealRepositoryProofDimension.CssSize,
] as const;

/** Evidence level for one adapter/capability claim. */
export const enum AdapterCapabilityEvidenceStatusTag {
	Missing = "missing",
	Fixture = "fixture",
	Repository = "real-repository",
	Promoted = "promoted",
}

export const enum RealRepositoryProofDimensionStatus {
	Passed = "passed",
	Failed = "failed",
	Pending = "pending",
	Unavailable = "unavailable",
	PipelineUnpaired = "pipeline-unpaired",
	NotApplicable = "not-applicable",
}

/** Stable keys emitted by installed-project proof runners. */
export const enum InstalledProjectProofCheckTag {
	SourceTypecheck = "sourceTypecheck",
	TargetTypecheck = "targetTypecheck",
	SourceBuild = "sourceBuild",
	TargetBuild = "targetBuild",
	SourceSsr = "sourceSsr",
	TargetSsr = "targetSsr",
	Hydration = "hydration",
}

/** Evidence state; source-static is not a claim of browser/SSR promotion. */
export const enum RealRepositoryProofStatus {
	SourceStatic = "source-static",
	SourceMismatch = "source-mismatch",
	RuntimePending = "runtime-pending",
	PipelineUnpaired = "pipeline-unpaired",
}

/** Execution source for differential evidence; semantic-model is not browser proof. */
export const enum DifferentialProofMode {
	SemanticModel = "semantic-model",
	ExternalRuntime = "external-runtime",
}

export const enum DifferentialExpectedTag {
	Pass = "pass",
	Residual = "residual",
}

export const enum HostComponentRewriterId {
	JsxIntrinsicComponent = "jsx-intrinsic-component",
	TemplateIntrinsicComponent = "template-intrinsic-component",
}

export const enum PandaMigrationStageId {
	ProjectDiscovery = "project-discovery",
	ThemeConfig = "theme-config",
	SourceScanning = "source-scanning",
	RecipePatternExtraction = "recipe-pattern-extraction",
	SemanticConversion = "semantic-conversion",
	ModuleEmission = "module-emission",
	RewriteApplication = "rewrite-application",
	ValidationReporting = "validation-reporting",
}

/** Runtime ids supplied by third-party plugins remain extensible. */
export type ExternalIdentifier = string & { readonly __pandwindIdentifier: unique symbol };

export function externalIdentifier(value: string): ExternalIdentifier {
	return value as ExternalIdentifier;
}
