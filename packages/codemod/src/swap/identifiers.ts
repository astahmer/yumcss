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
}

export const BUILTIN_CODEMOD_ADAPTER_IDS = [
	CodemodAdapterId.Pandwind,
	CodemodAdapterId.Panda,
	CodemodAdapterId.StyleX,
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
] as const;

export const enum CodemodPatternId {
	CssTemplate = "css-template",
	StyleXCreate = "stylex-create",
	StyleXKeyframes = "stylex-keyframes",
	StyleXDefineVars = "stylex-define-vars",
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
	Residual = "residual",
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

export const enum StyleProgramEmissionHint {
	GlobalVariables = "global-variables",
	RuntimeClass = "runtime-class",
	RuntimeFunction = "runtime-function",
	Recipe = "recipe",
	RawTemplate = "raw-template",
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
	BrowserStates = "browser-states",
	SsrHydration = "ssr-hydration",
	RscStreaming = "rsc-streaming",
	Dependencies = "dependencies",
	CssSize = "css-size",
}

export const enum RealRepositoryProofDimensionStatus {
	Passed = "passed",
	Failed = "failed",
	Pending = "pending",
	NotApplicable = "not-applicable",
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

export const enum MigrationStageId {
	AdapterMigration = "adapter-migration",
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
