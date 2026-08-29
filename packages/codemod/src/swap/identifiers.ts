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
}

/** Built-in source passes accepted by the non-swap CLI pipeline. */
export type SourcePassId = CodemodAdapterId.StyledComponents | CodemodAdapterId.StyleX;

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
	RawTemplate = "raw-template",
	RuntimeClass = "runtime-class",
	RuntimeFunction = "runtime-function",
	Recipe = "recipe",
}

export enum StyleProgramConditionOrder {
	Authored = "authored",
	Depth = "depth",
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

export type StyleValidatorIdentifier = StyleValidatorId | ExternalIdentifier;

export enum StyleLoweringId {
	DynamicAndTheme = "dynamic-and-theme",
	CompositionFlatten = "composition-flatten",
	RuntimeAndPlugin = "runtime-and-plugin",
	Builtin = "pandwind-core-lowerings",
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

export enum PandaMigrationPhase {
	Discovery = "discovery",
	Conversion = "conversion",
	Emission = "emission",
	Rewrite = "rewrite",
	Validation = "validation",
}

export enum PandaRewriteCandidateKind {
	StyleCall = "style-call",
	FactoryElement = "factory-element",
}

/** Identity helper for generated host-component selectors.
 *
 * Binding names are not globally unique: a docs corpus commonly has a
 * `Wrapper`, `Button`, or `Link` in many files. File-scoping the generated
 * selector preserves each component's cascade and its composed descendants.
 */
export class CodemodStyleIdentity {
	static className(file: string, binding: string): string {
		let hash = 2166136261;
		for (const character of `${file}:${binding}`) {
			hash ^= character.charCodeAt(0);
			hash = Math.imul(hash, 16777619);
		}
		return `pw-sc-${(hash >>> 0).toString(36)}-${binding}`;
	}
}

/** Runtime ids supplied by third-party plugins remain extensible. */
export type ExternalIdentifier = string & { readonly __pandwindIdentifier: unique symbol };

export function externalIdentifier(value: string): ExternalIdentifier {
	return value as ExternalIdentifier;
}
