/**
 * Built-in codemod identifiers.
 *
 * Third-party adapters may still use branded runtime identifiers created by a
 * plugin, but built-ins must use these values everywhere. This keeps the
 * composition root and adapter contracts independent from spelling mistakes.
 */
export enum CodemodAdapterId {
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

export enum CodemodPatternId {
	CssTemplate = "css-template",
	StyleXCreate = "stylex-create",
	StyleXKeyframes = "stylex-keyframes",
	StyleXDefineVars = "stylex-define-vars",
}

/** Built-in source dialects accepted by the legacy flat SwapIR path. */
export enum SwapSourceId {
	Auto = "auto",
	Css = "css",
	Design = "design",
	Dss = "dss",
	Tw = "tw",
}

export enum SwapTargetId {
	CssClass = "css.class",
	Design = "design",
	Dss = "dss",
	Tw = "tw",
	Tailwind = "tailwind",
}

export enum CodemodPluginId {
	BuiltinAdapters = "pandwind-builtin-adapters",
}

export enum StyleProgramEmissionHint {
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

export enum StyleProgramConditionOrder {
	Authored = "authored",
	Depth = "depth",
}

/** Syntax shape retained for dynamic lowering and host-specific rewrites. */
export enum StyleDynamicExpressionKind {
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
export enum StyleProgramCompositionKind {
	Mixin = "mixin",
	Extends = "extends",
	Recipe = "recipe",
	Slot = "slot",
}

export enum StyleValidatorId {
	CanonicalCss = "canonical-css",
	Residuals = "residuals",
	BrowserStates = "browser-states",
	SsrHydration = "ssr-hydration",
	Dependencies = "dependencies",
	RscStreaming = "rsc-streaming",
	Builtin = "pandwind-core-validators",
}

export enum StyleLoweringId {
	DynamicAndTheme = "dynamic-and-theme",
	CompositionFlatten = "composition-flatten",
	RuntimeAndPlugin = "runtime-and-plugin",
	Builtin = "pandwind-core-lowerings",
}

/** Typed causes used by the source-preserving migration diagnostics. */
export enum MigrationSkipReason {
	CapabilityBlocked = "capability-blocked",
	ParseResidual = "parse-residual",
	LoweringResidual = "lowering-residual",
	HostRewriteRequired = "host-rewrite-required",
	ConfigurationResidual = "configuration-residual",
}

/** Ordered semantic representations negotiated by the lowering planner. */
export enum StyleRepresentationKind {
	Static = "static",
	NamedMap = "named-map",
	TargetNative = "target-native",
	CustomProperty = "custom-property",
	RuntimeCarrier = "runtime-carrier",
	Residual = "residual",
}

/** Target-owned strategy for preserving named style object return shapes. */
export enum StyleNamedRuleStrategy {
	NativeMap = "native-map",
	ClassMap = "class-map",
	Unsupported = "unsupported",
}

/** Independent evidence dimensions used by real-repository promotion reports. */
export enum RealRepositoryProofDimension {
	CanonicalCss = "canonical-css",
	BrowserStates = "browser-states",
	SsrHydration = "ssr-hydration",
	RscStreaming = "rsc-streaming",
	Dependencies = "dependencies",
	CssSize = "css-size",
}

export enum RealRepositoryProofDimensionStatus {
	Passed = "passed",
	Failed = "failed",
	Pending = "pending",
	NotApplicable = "not-applicable",
}

/** Evidence state; source-static is not a claim of browser/SSR promotion. */
export enum RealRepositoryProofStatus {
	SourceStatic = "source-static",
	SourceMismatch = "source-mismatch",
	RuntimePending = "runtime-pending",
	PipelineUnpaired = "pipeline-unpaired",
}

/** Execution source for differential evidence; semantic-model is not browser proof. */
export enum DifferentialProofMode {
	SemanticModel = "semantic-model",
	ExternalRuntime = "external-runtime",
}

export enum MigrationStageId {
	AdapterMigration = "adapter-migration",
}

export enum HostComponentRewriterId {
	JsxIntrinsicComponent = "jsx-intrinsic-component",
	TemplateIntrinsicComponent = "template-intrinsic-component",
}

export enum PandaMigrationStageId {
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
