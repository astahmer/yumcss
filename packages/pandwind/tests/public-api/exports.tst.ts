import { expect, test } from "tstyche";

declare const noValueExports: unique symbol;

type PublicValueExports = {
	".": keyof typeof import("pandwind");
	"./css": keyof typeof import("pandwind/css");
	"./css/generated": keyof typeof import("pandwind/css/generated");
	"./css/named": keyof typeof import("pandwind/css/named");
	"./unsafe/css": keyof typeof import("pandwind/unsafe/css");
	"./css/runtime": keyof typeof import("pandwind/css/runtime");
	"./css/selector-scan": keyof typeof import("pandwind/css/selector-scan");
	"./css/stylex": keyof typeof import("pandwind/css/stylex");
	"./css/panda": keyof typeof import("pandwind/css/panda");
	"./css/unocss": keyof typeof import("pandwind/css/unocss");
	"./cx": keyof typeof import("pandwind/cx");
	"./preset": keyof typeof import("pandwind/preset");
	"./preset/csstype": keyof typeof import("pandwind/preset/csstype");
	"./preset/default": keyof typeof import("pandwind/preset/default");
	"./preset/tailwindcss": keyof typeof import("pandwind/preset/tailwindcss");
	"./preset/chakra": keyof typeof import("pandwind/preset/chakra");
	"./preset/shadcn": keyof typeof import("pandwind/preset/shadcn");
	"./preset/panda": keyof typeof import("pandwind/preset/panda");
	"./stack": keyof typeof import("pandwind/stack");
	"./stack/react": keyof typeof import("pandwind/stack/react");
	"./stack/solid": keyof typeof import("pandwind/stack/solid");
	"./stack/vue": keyof typeof import("pandwind/stack/vue");
	"./stack/preact": keyof typeof import("pandwind/stack/preact");
	"./design": keyof typeof import("pandwind/design");
	"./host": keyof typeof import("pandwind/host");
	"./tw": keyof typeof import("pandwind/tw");
	"./tw/collect": keyof typeof import("pandwind/tw/collect");
	"./vite": keyof typeof import("pandwind/vite");
	"./vite/runtime-pruner": keyof typeof import("pandwind/vite/runtime-pruner");
	"./vite/css-extract": keyof typeof import("pandwind/vite/css-extract");
	"./vite/css-inline-analysis": keyof typeof import("pandwind/vite/css-inline-analysis");
	"./vite/lib-artifact": keyof typeof import("pandwind/vite/lib-artifact");
	"./vite/cross-module-consts": keyof typeof import("pandwind/vite/cross-module-consts");
	"./vite/cx-inline": keyof typeof import("pandwind/vite/cx-inline");
	"./vite/inline": keyof typeof import("pandwind/vite/inline");
	"./vite/stack-fold": keyof typeof import("pandwind/vite/stack-fold");
	"./unplugin": keyof typeof import("pandwind/unplugin");
	"./css/create-stylesheet": keyof typeof import("pandwind/css/create-stylesheet");
	"./design/resolve": keyof typeof import("pandwind/design/resolve");
	"./lib/utils": keyof typeof import("pandwind/lib/utils");
	"./tw/compile": keyof typeof import("pandwind/tw/compile");
	"./tw/literal": keyof typeof import("pandwind/tw/literal");
	"./react-native": keyof typeof import("pandwind/react-native");
	"./types/typings": keyof typeof import("pandwind/types/typings");
	"./opentui": keyof typeof import("pandwind/opentui");
	"./react-strict-dom": keyof typeof import("pandwind/react-strict-dom");
	"./backends": keyof typeof import("pandwind/backends");
	"./source": keyof typeof import("pandwind/source");
	"./source/workspace": keyof typeof import("pandwind/source/workspace");
	"./_runtime/css-base": keyof typeof import("pandwind/_runtime/css-base");
	"./_runtime/css-codegen": keyof typeof import("pandwind/_runtime/css-codegen");
	"./_runtime/css-preset": keyof typeof import("pandwind/_runtime/css-preset");
	"./_runtime/css-design": keyof typeof import("pandwind/_runtime/css-design");
	"./_runtime/css-class": keyof typeof import("pandwind/_runtime/css-class");
	"./_runtime/css-vars": keyof typeof import("pandwind/_runtime/css-vars");
	"./_runtime/css-raw": keyof typeof import("pandwind/_runtime/css-raw");
	"./_runtime/css-props": keyof typeof import("pandwind/_runtime/css-props");
	"./_runtime/css-group": keyof typeof import("pandwind/_runtime/css-group");
	"./_runtime/css-input": keyof typeof import("pandwind/_runtime/css-input");
	"./_runtime/css-keyframes": keyof typeof import("pandwind/_runtime/css-keyframes");
};

type ObservedPublicValueExports = {
	[Subpath in keyof PublicValueExports]: PublicValueExports[Subpath] | typeof noValueExports;
};

type ExpectedPublicValueExports = {
	".":
		| "createCx"
		| "createTw"
		| "createTwAdapter"
		| "resolveVar"
		| "simplifyCalc"
		| "themeVariables"
		| "tw"
		| typeof noValueExports;
	"./css": "createCss" | "firstThatWorks" | typeof noValueExports;
	"./css/generated": "createGeneratedCss" | typeof noValueExports;
	"./css/named": "createNamedAtomsStrategy" | typeof noValueExports;
	"./unsafe/css": "createUnsafeCss" | typeof noValueExports;
	"./css/runtime":
		| "RuntimeSemanticRuleKindTag"
		| "createRuntimeCss"
		| "createRuntimeDesignCss"
		| "createRuntimeSheet"
		| typeof noValueExports;
	"./css/selector-scan": "selectorClassMatches" | "splitSelectorList" | typeof noValueExports;
	"./css/stylex": "createStyleXAdapter" | typeof noValueExports;
	"./css/panda": "createPandaAdapter" | typeof noValueExports;
	"./css/unocss": "createUnoCssAdapter" | typeof noValueExports;
	"./cx": "createCx" | typeof noValueExports;
	"./preset":
		| "csstypePreset"
		| "csstypeProperties"
		| "defaultPreset"
		| "define"
		| "presetConditions"
		| "presetProperties"
		| "tokens"
		| typeof noValueExports;
	"./preset/csstype": "csstypePreset" | "csstypeProperties" | typeof noValueExports;
	"./preset/default": "defaultPreset" | typeof noValueExports;
	"./preset/tailwindcss":
		| "tailwindConditions"
		| "tailwindPreset"
		| "tailwindProperties"
		| "tailwindTokens"
		| typeof noValueExports;
	"./preset/chakra":
		| "chakraConditions"
		| "chakraPreset"
		| "chakraProperties"
		| "chakraTokens"
		| typeof noValueExports;
	"./preset/shadcn":
		| "createShadcnPreset"
		| "resolveShadcnConfig"
		| "shadcnColorRoles"
		| "shadcnColorVariables"
		| "shadcnConditions"
		| "shadcnDeclarations"
		| "shadcnFontVariables"
		| "shadcnPreset"
		| "shadcnProperties"
		| "shadcnThemesForBaseColor"
		| "shadcnTokens"
		| typeof noValueExports;
	"./preset/panda":
		| "pandaConditions"
		| "pandaPreset"
		| "pandaProperties"
		| "pandaTokens"
		| typeof noValueExports;
	"./stack": "createStackClassName" | "stackClasses" | "stackStyle" | typeof noValueExports;
	"./stack/react": "Stack" | "createStack" | typeof noValueExports;
	"./stack/solid": "Stack" | "createStack" | typeof noValueExports;
	"./stack/vue": "Stack" | "createStack" | typeof noValueExports;
	"./stack/preact": "Stack" | "createStack" | typeof noValueExports;
	"./design": "createDesignCss" | typeof noValueExports;
	"./host":
		| "BUILTIN_HOST_STYLE_PLUGINS"
		| "HOST_STYLE_PLUGIN_SCHEMA"
		| "HOST_STYLE_REGISTRY"
		| "createHostStyleRegistry"
		| "getHostStyleAdapter"
		| typeof noValueExports;
	"./tw":
		| "createTw"
		| "createTwAdapter"
		| "resolveVar"
		| "simplifyCalc"
		| "themeVariables"
		| "tw"
		| typeof noValueExports;
	"./tw/collect":
		| "collectTwClasses"
		| "createTwClassCollector"
		| "runTwScan"
		| typeof noValueExports;
	"./vite":
		| "PANDWIND_LIB_COMPILER"
		| "PANDWIND_LIB_GENERATOR"
		| "PANDWIND_LIB_SCHEMA"
		| "checkPandwindLibCompatibility"
		| "createInlineTwPluginCore"
		| "createPandwindEngineContext"
		| "createPandwindLibArtifact"
		| "createPandwindLibCompatibility"
		| "foldStackElements"
		| "hashPandwindLibSource"
		| "pandwindCssVite"
		| "pandwindVite"
		| "stackFoldVite"
		| "validatePandwindLibArtifact"
		| typeof noValueExports;
	"./vite/runtime-pruner":
		| "createRuntimePruningTransform"
		| "explainRuntimePruning"
		| typeof noValueExports;
	"./vite/css-extract":
		| "createCssExtractionService"
		| "createCssSourceScanner"
		| typeof noValueExports;
	"./vite/css-inline-analysis":
		| "CSS_INLINE_UNKNOWN"
		| "CssInlineResidualCode"
		| "analyzeCssInlineArguments"
		| "canonicalStyleKey"
		| "createCssLiteralScopeResolver"
		| "createFirstThatWorksEvaluator"
		| "evalLiteral"
		| "findCssFallbackValueNames"
		| "isLiteralKeyframeBody"
		| typeof noValueExports;
	"./vite/lib-artifact":
		| "PANDWIND_LIB_COMPILER"
		| "PANDWIND_LIB_GENERATOR"
		| "PANDWIND_LIB_SCHEMA"
		| "checkPandwindLibCompatibility"
		| "createPandwindLibArtifact"
		| "createPandwindLibCompatibility"
		| "hashPandwindLibSource"
		| "validatePandwindLibArtifact"
		| typeof noValueExports;
	"./vite/cross-module-consts":
		| "analyzeModuleExports"
		| "bindingIsShadowedOrWritten"
		| "collectImportBindings"
		| "createCrossModuleConstResolver"
		| typeof noValueExports;
	"./vite/cx-inline":
		| "collectModuleConstants"
		| "defaultCxCompilerPorts"
		| "evalStaticCx"
		| "findCxImports"
		| "inlineCxCalls"
		| typeof noValueExports;
	"./vite/inline":
		| "OnUnresolvedTag"
		| "extractTwConfig"
		| "extractTwConfigFromSources"
		| "inlineTwCalls"
		| typeof noValueExports;
	"./vite/stack-fold": "foldStackElements" | "stackFoldVite" | typeof noValueExports;
	"./unplugin":
		| "pandwindRollup"
		| "pandwindRollupCss"
		| "pandwindUnplugin"
		| "pandwindUnpluginCss"
		| "pandwindWebpack"
		| "pandwindWebpackCss"
		| typeof noValueExports;
	"./css/create-stylesheet":
		| "createStylesheet"
		| "decodeAtomicPath"
		| "getPropertyPriority"
		| typeof noValueExports;
	"./design/resolve":
		| "DefaultDesignModuleRegistry"
		| "DesignStyleResolver"
		| "createDesignModuleRegistry"
		| "resolveDesignStyle"
		| typeof noValueExports;
	"./lib/utils":
		| "assign"
		| "concatPair"
		| "cssVar"
		| "dashCase"
		| "flatten"
		| "flattenStyle"
		| "isSafePathPart"
		| "joinParts"
		| "pairs"
		| "splitPair"
		| typeof noValueExports;
	"./tw/compile": "UTILITY_SUBKEYS" | "compileStyles" | typeof noValueExports;
	"./tw/literal":
		| "ImportKindTag"
		| "NodeKind"
		| "PropertyKindTag"
		| "VariableDeclarationKindTag"
		| "evalLiteral"
		| "evalLiteralValues"
		| "isTwCall"
		| "literalValueSetSize"
		| "walk"
		| "walkWithParent"
		| typeof noValueExports;
	"./react-native":
		| "createCx"
		| "createDesignCss"
		| "createObjectCss"
		| "createObjectCx"
		| "createRnBackend"
		| typeof noValueExports;
	"./types/typings": typeof noValueExports;
	"./opentui":
		| "createCx"
		| "createDesignCss"
		| "createObjectCss"
		| "createObjectCx"
		| "createOpentuiBackend"
		| typeof noValueExports;
	"./react-strict-dom":
		| "ReactStrictDomPlatform"
		| "createCss"
		| "createCx"
		| "createDesignCss"
		| "createReactStrictDomBackend"
		| typeof noValueExports;
	"./backends":
		| "REACT_STRICT_DOM_BACKEND"
		| "ReactStrictDomPlatform"
		| "STYLE_BACKENDS"
		| "STYLE_BACKEND_CONTRACT_SCHEMA"
		| "STYLE_BACKEND_FACTORIES"
		| "STYLE_BACKEND_SCHEMA"
		| "StyleBackendId"
		| "createCssBackend"
		| "createDesignObjectCss"
		| "createObjectBackend"
		| "createObjectCss"
		| "createObjectCx"
		| "createOpentuiBackend"
		| "createReactStrictDomBackend"
		| "createRnBackend"
		| "createStyleBackendContractSuite"
		| "createStyleBackendRegistry"
		| typeof noValueExports;
	"./source":
		| "BUILTIN_SOURCE_SCANNER_PLUGIN"
		| "SOURCE_LANGUAGE_ADAPTERS"
		| "SOURCE_PROJECT_BINDINGS_SCHEMA"
		| "SOURCE_SCANNER"
		| "SOURCE_SCANNER_CONTRACT_SCHEMA"
		| "SOURCE_SCANNER_PLUGIN_SCHEMA"
		| "SOURCE_SCANNER_SCHEMA"
		| "SOURCE_SCANNER_SERVICE"
		| "SourceBindingKind"
		| "SourceBindings"
		| "SourceCallSiteKind"
		| "SourceHostUseKind"
		| "SourceLanguageAdapterId"
		| "SourceRuntimeBoundary"
		| "computeExcludedRanges"
		| "createSourceProjectBindingIndex"
		| "createSourceScannerContractSuite"
		| "createSourceScannerRegistry"
		| "parseSourceProgram"
		| typeof noValueExports;
	"./source/workspace": "SOURCE_WORKSPACE_SCHEMA" | "createSourceWorkspace" | typeof noValueExports;
	"./_runtime/css-base": "DYNAMIC" | "createCssRuntime" | typeof noValueExports;
	"./_runtime/css-codegen":
		| "CSS_RUNTIME_METHODS"
		| "CssRuntimeFactoryTag"
		| "CssRuntimeMethodTag"
		| "normalizeCssRuntimeMethods"
		| "renderCssRuntimeModule"
		| typeof noValueExports;
	"./_runtime/css-preset": "createPresetCssRuntime" | typeof noValueExports;
	"./_runtime/css-design": "createDesignCssRuntime" | typeof noValueExports;
	"./_runtime/css-class": "attachClass" | typeof noValueExports;
	"./_runtime/css-vars": "attachVars" | typeof noValueExports;
	"./_runtime/css-raw": "attachRaw" | typeof noValueExports;
	"./_runtime/css-props": "attachProps" | typeof noValueExports;
	"./_runtime/css-group": "attachGroup" | typeof noValueExports;
	"./_runtime/css-input": "attachInput" | typeof noValueExports;
	"./_runtime/css-keyframes": "attachKeyframes" | typeof noValueExports;
};

type PublicTypeExportWitness = {
	".": readonly [
		import("pandwind").CxFn,
		import("pandwind").CxInput,
		import("pandwind").CxOptions,
		import("pandwind").TwAdapterOptions,
		import("pandwind").TwComposeMeta,
		import("pandwind").TwConflictsMeta,
		import("pandwind").TwDirectionalConflictsMeta,
		import("pandwind").TwNestedStyles,
		import("pandwind").TwOptions,
		import("pandwind").TwValue,
		import("pandwind").TwVariantsMeta,
		import("pandwind").UtilityBridge,
		import("pandwind").VarAtom,
		import("pandwind").VarsOutput,
	];
	"./css": readonly [
		import("pandwind/css").AtomicStyleProps<never>,
		import("pandwind/css").ClassNameStrategy,
		import("pandwind/css").CreateCssOptions,
		import("pandwind/css").CssCascade,
		import("pandwind/css").CssCascadeLayerOptions,
		import("pandwind/css").CssCascadeMode,
		import("pandwind/css").CssFn<never, never, never>,
		import("pandwind/css").FirstThatWorksValue,
	];
	"./css/generated": readonly [];
	"./css/named": readonly [];
	"./unsafe/css": readonly [
		import("pandwind/unsafe/css").CreateCssOptions,
		import("pandwind/unsafe/css").CssFn<never, never, never>,
	];
	"./css/runtime": readonly [
		import("pandwind/css/runtime").RuntimeCssFn<never, never, never, never, never, never>,
		import("pandwind/css/runtime").RuntimeCssOptions,
		import("pandwind/css/runtime").RuntimeDeclaration,
		import("pandwind/css/runtime").RuntimeDocument,
		import("pandwind/css/runtime").RuntimeOrderingPolicy,
		import("pandwind/css/runtime").RuntimeRule,
		import("pandwind/css/runtime").RuntimeRuleCanonicalizer,
		import("pandwind/css/runtime").RuntimeRuleSerializer,
		import("pandwind/css/runtime").RuntimeSemanticRule,
		import("pandwind/css/runtime").RuntimeSemanticRuleKind,
		import("pandwind/css/runtime").RuntimeSheet,
		import("pandwind/css/runtime").RuntimeSheetOptions,
		import("pandwind/css/runtime").RuntimeSheetSnapshot,
		import("pandwind/css/runtime").RuntimeStyleElementSink,
	];
	"./css/selector-scan": readonly [import("pandwind/css/selector-scan").SelectorClassMatch];
	"./css/stylex": readonly [import("pandwind/css/stylex").StyleXAdapterOptions];
	"./css/panda": readonly [import("pandwind/css/panda").PandaAdapterOptions];
	"./css/unocss": readonly [import("pandwind/css/unocss").UnoCssAdapterOptions];
	"./cx": readonly [
		import("pandwind/cx").CxFn,
		import("pandwind/cx").CxInput,
		import("pandwind/cx").CxOptions,
		import("pandwind/cx").VarAtom,
		import("pandwind/cx").VarsOutput,
	];
	"./preset": readonly [
		import("pandwind/preset").AnyConditions,
		import("pandwind/preset").AnyCssConfig,
		import("pandwind/preset").AnyPresetProperties<never, never>,
		import("pandwind/preset").AnySemanticTokens<never>,
		import("pandwind/preset").AnySimpleTokens,
		import("pandwind/preset").AnyTokens,
		import("pandwind/preset").ColorPaletteDefinitions<never>,
		import("pandwind/preset").ColorPaletteSource<never>,
		import("pandwind/preset").CssConfigReturn<never>,
		import("pandwind/preset").CssPreset<never, never, never, never, never>,
		import("pandwind/preset").CsstypePreset,
		import("pandwind/preset").CsstypeProperties,
		import("pandwind/preset").CssVariableDescriptor,
		import("pandwind/preset").CssVariables,
		import("pandwind/preset").CssVariableValue,
		import("pandwind/preset").CssWideValue,
		import("pandwind/preset").DefaultPreset,
		import("pandwind/preset").DefinePresetOptions<never, never>,
		import("pandwind/preset").DynamicStyleObject,
		import("pandwind/preset").DynamicStyleValue,
		import("pandwind/preset").PandwindCssValue,
		import("pandwind/preset").PandwindProperties,
		import("pandwind/preset").PresetConditions,
		import("pandwind/preset").PresetWeb,
		import("pandwind/preset").PresetWebFontFace,
		import("pandwind/preset").PresetWebKeyframeBody,
		import("pandwind/preset").PresetWebStyleObject,
		import("pandwind/preset").PresetWebValue,
		import("pandwind/preset").SemanticToken<never>,
		import("pandwind/preset").SimpleToken,
		import("pandwind/preset").StyleObject,
		import("pandwind/preset").StyleValue,
		import("pandwind/preset").Token<never>,
		import("pandwind/preset").TokenCatalog<never>,
		import("pandwind/preset").TokenDeclaration,
		import("pandwind/preset").TokenGroup<never, never>,
		import("pandwind/preset").TokenGroupKey<never>,
		import("pandwind/preset").TokenReference<never>,
		import("pandwind/preset").Tokens,
		import("pandwind/preset").TokenVariableNames,
		import("pandwind/preset").TokenVariables,
		import("pandwind/preset").TypedDynamicStyleObject<never>,
		import("pandwind/preset").TypedRawStyleObject<never>,
		import("pandwind/preset").TypedStyleObject<never, never>,
	];
	"./preset/csstype": readonly [
		import("pandwind/preset/csstype").CsstypePreset,
		import("pandwind/preset/csstype").CsstypeProperties,
	];
	"./preset/default": readonly [import("pandwind/preset/default").DefaultPreset];
	"./preset/tailwindcss": readonly [
		import("pandwind/preset/tailwindcss").TailwindConditions,
		import("pandwind/preset/tailwindcss").TailwindPreset,
		import("pandwind/preset/tailwindcss").TailwindProperties,
		import("pandwind/preset/tailwindcss").TailwindTokens,
	];
	"./preset/chakra": readonly [
		import("pandwind/preset/chakra").ChakraConditions,
		import("pandwind/preset/chakra").ChakraCssConfig,
		import("pandwind/preset/chakra").ChakraExtraProperty,
		import("pandwind/preset/chakra").ChakraPreset,
		import("pandwind/preset/chakra").ChakraProperties,
		import("pandwind/preset/chakra").ChakraTokens,
	];
	"./preset/shadcn": readonly [
		import("pandwind/preset/shadcn").ShadcnBaseColor,
		import("pandwind/preset/shadcn").ShadcnBaseColorLightVariables,
		import("pandwind/preset/shadcn").ShadcnColorRole,
		import("pandwind/preset/shadcn").ShadcnColorToken,
		import("pandwind/preset/shadcn").ShadcnColorTokens,
		import("pandwind/preset/shadcn").ShadcnConditions,
		import("pandwind/preset/shadcn").ShadcnConfig,
		import("pandwind/preset/shadcn").ShadcnDeclarations,
		import("pandwind/preset/shadcn").ShadcnFontHeadingName,
		import("pandwind/preset/shadcn").ShadcnFontName,
		import("pandwind/preset/shadcn").ShadcnMenuAccent,
		import("pandwind/preset/shadcn").ShadcnMenuColor,
		import("pandwind/preset/shadcn").ShadcnPreset,
		import("pandwind/preset/shadcn").ShadcnPresetOptions,
		import("pandwind/preset/shadcn").ShadcnProperties,
		import("pandwind/preset/shadcn").ShadcnRadiusName,
		import("pandwind/preset/shadcn").ShadcnStyleName,
		import("pandwind/preset/shadcn").ShadcnThemeName,
		import("pandwind/preset/shadcn").ShadcnTokens,
	];
	"./preset/panda": readonly [
		import("pandwind/preset/panda").PandaConditions,
		import("pandwind/preset/panda").PandaCssConfig,
		import("pandwind/preset/panda").PandaExtraProperty,
		import("pandwind/preset/panda").PandaPreset,
		import("pandwind/preset/panda").PandaProperties,
		import("pandwind/preset/panda").PandaTokens,
	];
	"./stack": readonly [
		import("pandwind/stack").StackAlign,
		import("pandwind/stack").StackClassCompiler,
		import("pandwind/stack").StackClassName,
		import("pandwind/stack").StackCssValue,
		import("pandwind/stack").StackDirection,
		import("pandwind/stack").StackJustify,
		import("pandwind/stack").StackProps,
		import("pandwind/stack").StackResponsiveValue<never>,
		import("pandwind/stack").StackStyle,
	];
	"./stack/react": readonly [
		import("pandwind/stack/react").StackComponentProps,
		import("pandwind/stack/react").StackProps,
	];
	"./stack/solid": readonly [import("pandwind/stack/solid").StackComponentProps];
	"./stack/vue": readonly [import("pandwind/stack/vue").StackComponentProps];
	"./stack/preact": readonly [import("pandwind/stack/preact").StackComponentProps];
	"./design": readonly [
		import("pandwind/design").DesignDynamicStyleObject<never>,
		import("pandwind/design").DesignPreset,
		import("pandwind/design").DesignStyleObject<never>,
	];
	"./host": readonly [
		import("pandwind/host").BuiltinHostFramework,
		import("pandwind/host").HostFramework,
		import("pandwind/host").HostStyleAdapter,
		import("pandwind/host").HostStylePlugin,
		import("pandwind/host").HostStyleRegistry,
	];
	"./tw": readonly [
		import("pandwind/tw").TwAdapterOptions,
		import("pandwind/tw").TwComposeMeta,
		import("pandwind/tw").TwConflictsMeta,
		import("pandwind/tw").TwDirectionalConflictsMeta,
		import("pandwind/tw").TwNestedStyles,
		import("pandwind/tw").TwOptions,
		import("pandwind/tw").TwValue,
		import("pandwind/tw").TwVariantsMeta,
		import("pandwind/tw").UtilityBridge,
	];
	"./tw/collect": readonly [
		import("pandwind/tw/collect").TwClassCollector,
		import("pandwind/tw/collect").TwCollectResult,
		import("pandwind/tw/collect").TwScanOptions,
		import("pandwind/tw/collect").TwScanResult,
	];
	"./vite": readonly [
		import("pandwind/vite").InlineTwPluginCore,
		import("pandwind/vite").PandwindCssViteOptions,
		import("pandwind/vite").PandwindEngineContext,
		import("pandwind/vite").PandwindEngineContextOptions,
		import("pandwind/vite").PandwindLibArtifact,
		import("pandwind/vite").PandwindLibArtifactInput,
		import("pandwind/vite").PandwindLibCompatibility,
		import("pandwind/vite").PandwindLibCompatibilityCheck,
		import("pandwind/vite").PandwindLibCompatibilityOptions,
		import("pandwind/vite").PandwindLibRule,
		import("pandwind/vite").PandwindLibSource,
		import("pandwind/vite").PandwindLibValidation,
		import("pandwind/vite").PandwindViteOptions,
		import("pandwind/vite").Resolver,
		import("pandwind/vite").StackFoldOptions,
	];
	"./vite/runtime-pruner": readonly [
		import("pandwind/vite/runtime-pruner").RuntimePruningExplanation,
		import("pandwind/vite/runtime-pruner").RuntimePruningExplanationOptions,
		import("pandwind/vite/runtime-pruner").RuntimePruningOptions,
		import("pandwind/vite/runtime-pruner").RuntimePruningStatus,
		import("pandwind/vite/runtime-pruner").RuntimePruningTransform,
	];
	"./vite/css-extract": readonly [
		import("pandwind/vite/css-extract").AuthoredCssImport,
		import("pandwind/vite/css-extract").CssCallSite,
		import("pandwind/vite/css-extract").CssDiagnostic,
		import("pandwind/vite/css-extract").CssDiagnosticKind,
		import("pandwind/vite/css-extract").CssExtractionServiceOptions,
		import("pandwind/vite/css-extract").CssFileExtraction,
		import("pandwind/vite/css-extract").CssPreset,
		import("pandwind/vite/css-extract").CssSourceInspection,
		import("pandwind/vite/css-extract").CssSourceProvenance,
		import("pandwind/vite/css-extract").CssSourceScanner,
		import("pandwind/vite/css-extract").ExtractedCssStyle,
		import("pandwind/vite/css-extract").InlineCssResult,
	];
	"./vite/css-inline-analysis": readonly [
		import("pandwind/vite/css-inline-analysis").CssInlineAnalysis,
		import("pandwind/vite/css-inline-analysis").CssInlineAnalysisOptions,
		import("pandwind/vite/css-inline-analysis").CssInlineArgumentAnalysis,
		import("pandwind/vite/css-inline-analysis").CssInlineEntry,
		import("pandwind/vite/css-inline-analysis").CssInlineResidual,
		import("pandwind/vite/css-inline-analysis").CssInlineResidualCode,
		import("pandwind/vite/css-inline-analysis").InlineAstNode,
		import("pandwind/vite/css-inline-analysis").LiteralCallEvaluator,
		import("pandwind/vite/css-inline-analysis").LiteralConstantScope,
		import("pandwind/vite/css-inline-analysis").OxcNode,
	];
	"./vite/lib-artifact": readonly [
		import("pandwind/vite/lib-artifact").PandwindLibArtifact,
		import("pandwind/vite/lib-artifact").PandwindLibArtifactInput,
		import("pandwind/vite/lib-artifact").PandwindLibCompatibility,
		import("pandwind/vite/lib-artifact").PandwindLibCompatibilityCheck,
		import("pandwind/vite/lib-artifact").PandwindLibCompatibilityOptions,
		import("pandwind/vite/lib-artifact").PandwindLibRule,
		import("pandwind/vite/lib-artifact").PandwindLibSource,
		import("pandwind/vite/lib-artifact").PandwindLibValidation,
	];
	"./vite/cross-module-consts": readonly [
		import("pandwind/vite/cross-module-consts").CrossModuleResolver,
		import("pandwind/vite/cross-module-consts").CrossModuleResolverOptions,
		import("pandwind/vite/cross-module-consts").ImportBinding,
		import("pandwind/vite/cross-module-consts").ModuleExportAnalysis,
	];
	"./vite/cx-inline": readonly [
		import("pandwind/vite/cx-inline").ConstantScope,
		import("pandwind/vite/cx-inline").CxCompilerOptions,
		import("pandwind/vite/cx-inline").CxCompilerPorts,
		import("pandwind/vite/cx-inline").CxFoldContext,
		import("pandwind/vite/cx-inline").CxImportInfo,
		import("pandwind/vite/cx-inline").InlineCxCallsOptions,
		import("pandwind/vite/cx-inline").InlineResult,
		import("pandwind/vite/cx-inline").KnownConstant,
		import("pandwind/vite/cx-inline").StaticEval,
	];
	"./vite/inline": readonly [
		import("pandwind/vite/inline").InlineResult,
		import("pandwind/vite/inline").OnUnresolved,
		import("pandwind/vite/inline").TwConfig,
		import("pandwind/vite/inline").UnresolvedOptions,
	];
	"./vite/stack-fold": readonly [import("pandwind/vite/stack-fold").StackFoldOptions];
	"./unplugin": readonly [
		import("pandwind/unplugin").PandwindUnpluginCssOptions,
		import("pandwind/unplugin").PandwindUnpluginOptions,
	];
	"./css/create-stylesheet": readonly [
		import("pandwind/css/create-stylesheet").PreparedStyle,
		import("pandwind/css/create-stylesheet").StylesheetPolicies,
	];
	"./design/resolve": readonly [
		import("pandwind/design/resolve").DefaultDesignModuleRegistry,
		import("pandwind/design/resolve").DesignModuleAdapter,
		import("pandwind/design/resolve").DesignModuleContext,
		import("pandwind/design/resolve").DesignModuleRegistry,
		import("pandwind/design/resolve").DesignStyleResolver,
		import("pandwind/design/resolve").TokenLookup,
	];
	"./lib/utils": readonly [import("pandwind/lib/utils").FlatStyles];
	"./tw/compile": readonly [
		import("pandwind/tw/compile").TwComposeMeta,
		import("pandwind/tw/compile").TwConflictsMeta,
		import("pandwind/tw/compile").TwDirectionalConflictsMeta,
		import("pandwind/tw/compile").TwNestedStyles,
		import("pandwind/tw/compile").TwValue,
		import("pandwind/tw/compile").TwValueTokensMeta,
		import("pandwind/tw/compile").TwVariantsMeta,
	];
	"./tw/literal": readonly [
		import("pandwind/tw/literal").LiteralCallEvaluator,
		import("pandwind/tw/literal").LiteralConstantScope,
		import("pandwind/tw/literal").LiteralValueSet,
		import("pandwind/tw/literal").OxcNode,
		import("pandwind/tw/literal").OxcParentVisitor,
	];
	"./react-native": readonly [
		import("pandwind/react-native").ObjectBackend,
		import("pandwind/react-native").ObjectCssFn<never>,
		import("pandwind/react-native").ObjectCxFn,
		import("pandwind/react-native").RnCssFn<never>,
		import("pandwind/react-native").RnStyle,
		import("pandwind/react-native").TargetStyle,
	];
	"./types/typings": readonly [
		import("pandwind/types/typings").AnyConditions,
		import("pandwind/types/typings").AnyCssConfig,
		import("pandwind/types/typings").AnyPresetProperties<never, never>,
		import("pandwind/types/typings").AnySemanticTokens<never>,
		import("pandwind/types/typings").AnySimpleTokens,
		import("pandwind/types/typings").AnyTokens,
		import("pandwind/types/typings").ColorPaletteDefinitions<never>,
		import("pandwind/types/typings").ColorPaletteSource<never>,
		import("pandwind/types/typings").CssConfigReturn<never>,
		import("pandwind/types/typings").CssPreset<never, never, never, never, never>,
		import("pandwind/types/typings").CssVariableDescriptor,
		import("pandwind/types/typings").CssVariables,
		import("pandwind/types/typings").CssVariableValue,
		import("pandwind/types/typings").CssWideValue,
		import("pandwind/types/typings").DefinePresetOptions<never, never>,
		import("pandwind/types/typings").DynamicStyleObject,
		import("pandwind/types/typings").DynamicStyleValue,
		import("pandwind/types/typings").PresetWeb,
		import("pandwind/types/typings").PresetWebFontFace,
		import("pandwind/types/typings").PresetWebKeyframeBody,
		import("pandwind/types/typings").PresetWebStyleObject,
		import("pandwind/types/typings").PresetWebValue,
		import("pandwind/types/typings").SemanticToken<never>,
		import("pandwind/types/typings").SimpleToken,
		import("pandwind/types/typings").StyleObject,
		import("pandwind/types/typings").StyleValue,
		import("pandwind/types/typings").Token<never>,
		import("pandwind/types/typings").TokenCatalog<never>,
		import("pandwind/types/typings").TokenDeclaration,
		import("pandwind/types/typings").TokenGroup<never, never>,
		import("pandwind/types/typings").TokenGroupKey<never>,
		import("pandwind/types/typings").TokenReference<never>,
		import("pandwind/types/typings").TokenVariableNames,
		import("pandwind/types/typings").TokenVariables,
		import("pandwind/types/typings").TypedDynamicStyleObject<never>,
		import("pandwind/types/typings").TypedRawStyleObject<never>,
		import("pandwind/types/typings").TypedStyleObject<never, never>,
	];
	"./opentui": readonly [
		import("pandwind/opentui").ObjectBackend,
		import("pandwind/opentui").ObjectCssFn<never>,
		import("pandwind/opentui").ObjectCxFn,
		import("pandwind/opentui").OpentuiCssFn<never>,
		import("pandwind/opentui").OpentuiStyle,
		import("pandwind/opentui").TargetStyle,
	];
	"./react-strict-dom": readonly [
		import("pandwind/react-strict-dom").ReactStrictDomBackend,
		import("pandwind/react-strict-dom").ReactStrictDomBackendOptions,
		import("pandwind/react-strict-dom").ReactStrictDomCompiledStyle,
		import("pandwind/react-strict-dom").ReactStrictDomCssFn<never, never>,
		import("pandwind/react-strict-dom").ReactStrictDomCxFn<never>,
		import("pandwind/react-strict-dom").ReactStrictDomDesignCssFn<never, never>,
		import("pandwind/react-strict-dom").ReactStrictDomNativeBackendOptions,
		import("pandwind/react-strict-dom").ReactStrictDomNativeStyle,
		import("pandwind/react-strict-dom").ReactStrictDomPlatform,
		import("pandwind/react-strict-dom").ReactStrictDomPlatformType,
		import("pandwind/react-strict-dom").ReactStrictDomStyle,
		import("pandwind/react-strict-dom").ReactStrictDomStyleFor<never>,
		import("pandwind/react-strict-dom").ReactStrictDomWebBackendOptions,
	];
	"./backends": readonly [
		import("pandwind/backends").BackendArtifactKind,
		import("pandwind/backends").BackendCapabilityContract,
		import("pandwind/backends").BackendCapabilityLevel,
		import("pandwind/backends").BackendDeclarationIssue,
		import("pandwind/backends").BackendFeature,
		import("pandwind/backends").BackendLossiness,
		import("pandwind/backends").BuiltinBackendId,
		import("pandwind/backends").CssBackendOptions,
		import("pandwind/backends").FlatStyleIR,
		import("pandwind/backends").ObjectBackend,
		import("pandwind/backends").ObjectBackendOptions,
		import("pandwind/backends").ObjectCssFn<never>,
		import("pandwind/backends").ObjectCxFn,
		import("pandwind/backends").OpentuiBackendOptions,
		import("pandwind/backends").ReactStrictDomBackend,
		import("pandwind/backends").ReactStrictDomBackendOptions,
		import("pandwind/backends").ReactStrictDomCompiledStyle,
		import("pandwind/backends").ReactStrictDomNativeBackendOptions,
		import("pandwind/backends").ReactStrictDomPlatform,
		import("pandwind/backends").ReactStrictDomPlatformType,
		import("pandwind/backends").ReactStrictDomStyle,
		import("pandwind/backends").ReactStrictDomWebBackendOptions,
		import("pandwind/backends").RnBackendOptions,
		import("pandwind/backends").StyleBackend<never>,
		import("pandwind/backends").StyleBackendContractFailure,
		import("pandwind/backends").StyleBackendContractFixture,
		import("pandwind/backends").StyleBackendContractPhase,
		import("pandwind/backends").StyleBackendContractResult,
		import("pandwind/backends").StyleBackendContractSuite,
		import("pandwind/backends").StyleBackendFactory<never, never>,
		import("pandwind/backends").StyleBackendId,
		import("pandwind/backends").StyleBackendRegistry,
		import("pandwind/backends").TargetStyle,
	];
	"./source": readonly [
		import("pandwind/source").SourceBinding,
		import("pandwind/source").SourceBindingIndex,
		import("pandwind/source").SourceBindingKind,
		import("pandwind/source").SourceBindings,
		import("pandwind/source").SourceCallSite,
		import("pandwind/source").SourceCallSiteKind,
		import("pandwind/source").SourceDocument,
		import("pandwind/source").SourceExportAll,
		import("pandwind/source").SourceFramework,
		import("pandwind/source").SourceHostUse,
		import("pandwind/source").SourceHostUseKind,
		import("pandwind/source").SourceLanguage,
		import("pandwind/source").SourceLanguageAdapter,
		import("pandwind/source").SourceLanguageAdapterId,
		import("pandwind/source").SourceProjectBindingIndex,
		import("pandwind/source").SourceProjectBindingLoader,
		import("pandwind/source").SourceRange,
		import("pandwind/source").SourceReexport,
		import("pandwind/source").SourceRuntimeBoundary,
		import("pandwind/source").SourceScanDiagnostic,
		import("pandwind/source").SourceScannerContractFailure,
		import("pandwind/source").SourceScannerContractFixture,
		import("pandwind/source").SourceScannerContractResult,
		import("pandwind/source").SourceScannerContractSuite,
		import("pandwind/source").SourceScannerPlugin,
		import("pandwind/source").SourceScannerRegistry,
		import("pandwind/source").SourceScannerService,
		import("pandwind/source").SourceScanResult,
	];
	"./source/workspace": readonly [
		import("pandwind/source/workspace").SourceWorkspace,
		import("pandwind/source/workspace").SourceWorkspaceFile,
		import("pandwind/source/workspace").SourceWorkspaceFileSystem,
		import("pandwind/source/workspace").SourceWorkspaceGlobOptions,
		import("pandwind/source/workspace").SourceWorkspaceOptions,
		import("pandwind/source/workspace").SourceWorkspaceQuery,
	];
	"./_runtime/css-base": readonly [
		import("pandwind/_runtime/css-base").AnyInput,
		import("pandwind/_runtime/css-base").CompiledStyles,
		import("pandwind/_runtime/css-base").CreateCssOptions,
		import("pandwind/_runtime/css-base").CssStyle,
		import("pandwind/_runtime/css-base").DynamicFn<never>,
		import("pandwind/_runtime/css-base").DynamicReturn,
		import("pandwind/_runtime/css-base").DynamicStyles<never, never>,
		import("pandwind/_runtime/css-base").RuntimeCssAttachment,
		import("pandwind/_runtime/css-base").RuntimeCssContext,
		import("pandwind/_runtime/css-base").RuntimeCssFunction,
		import("pandwind/_runtime/css-base").TypedPreset,
		import("pandwind/_runtime/css-base").TypedRuntimeCssFunction<never>,
	];
	"./_runtime/css-codegen": readonly [
		import("pandwind/_runtime/css-codegen").CssRuntimeFactory,
		import("pandwind/_runtime/css-codegen").CssRuntimeMethod,
		import("pandwind/_runtime/css-codegen").RenderCssRuntimeModuleOptions,
	];
	"./_runtime/css-preset": readonly [import("pandwind/_runtime/css-preset").TypedPreset];
	"./_runtime/css-design": readonly [];
	"./_runtime/css-class": readonly [];
	"./_runtime/css-vars": readonly [];
	"./_runtime/css-raw": readonly [];
	"./_runtime/css-props": readonly [];
	"./_runtime/css-group": readonly [];
	"./_runtime/css-input": readonly [];
	"./_runtime/css-keyframes": readonly [];
};

test("every public subpath has a type-export witness", () => {
	expect<keyof PublicTypeExportWitness>().type.toBe<keyof PublicValueExports>();
	expect<PublicTypeExportWitness>().type.toBeAssignableTo<
		Record<keyof PublicTypeExportWitness, readonly unknown[]>
	>();
});

test("public value exports: pandwind", () => {
	expect<ObservedPublicValueExports["."]>().type.toBe<ExpectedPublicValueExports["."]>();
});

test("public value exports: pandwind/css", () => {
	expect<ObservedPublicValueExports["./css"]>().type.toBe<ExpectedPublicValueExports["./css"]>();
});

test("public value exports: pandwind/css/generated", () => {
	expect<ObservedPublicValueExports["./css/generated"]>().type.toBe<
		ExpectedPublicValueExports["./css/generated"]
	>();
});

test("public value exports: pandwind/css/named", () => {
	expect<ObservedPublicValueExports["./css/named"]>().type.toBe<
		ExpectedPublicValueExports["./css/named"]
	>();
});

test("public value exports: pandwind/unsafe/css", () => {
	expect<ObservedPublicValueExports["./unsafe/css"]>().type.toBe<
		ExpectedPublicValueExports["./unsafe/css"]
	>();
});

test("public value exports: pandwind/css/runtime", () => {
	expect<ObservedPublicValueExports["./css/runtime"]>().type.toBe<
		ExpectedPublicValueExports["./css/runtime"]
	>();
});

test("public value exports: pandwind/css/selector-scan", () => {
	expect<ObservedPublicValueExports["./css/selector-scan"]>().type.toBe<
		ExpectedPublicValueExports["./css/selector-scan"]
	>();
});

test("public value exports: pandwind/css/stylex", () => {
	expect<ObservedPublicValueExports["./css/stylex"]>().type.toBe<
		ExpectedPublicValueExports["./css/stylex"]
	>();
});

test("public value exports: pandwind/css/panda", () => {
	expect<ObservedPublicValueExports["./css/panda"]>().type.toBe<
		ExpectedPublicValueExports["./css/panda"]
	>();
});

test("public value exports: pandwind/css/unocss", () => {
	expect<ObservedPublicValueExports["./css/unocss"]>().type.toBe<
		ExpectedPublicValueExports["./css/unocss"]
	>();
});

test("public value exports: pandwind/cx", () => {
	expect<ObservedPublicValueExports["./cx"]>().type.toBe<ExpectedPublicValueExports["./cx"]>();
});

test("public value exports: pandwind/preset", () => {
	expect<ObservedPublicValueExports["./preset"]>().type.toBe<
		ExpectedPublicValueExports["./preset"]
	>();
});

test("public value exports: pandwind/preset/csstype", () => {
	expect<ObservedPublicValueExports["./preset/csstype"]>().type.toBe<
		ExpectedPublicValueExports["./preset/csstype"]
	>();
});

test("public value exports: pandwind/preset/default", () => {
	expect<ObservedPublicValueExports["./preset/default"]>().type.toBe<
		ExpectedPublicValueExports["./preset/default"]
	>();
});

test("public value exports: pandwind/preset/tailwindcss", () => {
	expect<ObservedPublicValueExports["./preset/tailwindcss"]>().type.toBe<
		ExpectedPublicValueExports["./preset/tailwindcss"]
	>();
});

test("public value exports: pandwind/preset/chakra", () => {
	expect<ObservedPublicValueExports["./preset/chakra"]>().type.toBe<
		ExpectedPublicValueExports["./preset/chakra"]
	>();
});

test("public value exports: pandwind/preset/shadcn", () => {
	expect<ObservedPublicValueExports["./preset/shadcn"]>().type.toBe<
		ExpectedPublicValueExports["./preset/shadcn"]
	>();
});

test("public value exports: pandwind/preset/panda", () => {
	expect<ObservedPublicValueExports["./preset/panda"]>().type.toBe<
		ExpectedPublicValueExports["./preset/panda"]
	>();
});

test("public value exports: pandwind/stack", () => {
	expect<ObservedPublicValueExports["./stack"]>().type.toBe<
		ExpectedPublicValueExports["./stack"]
	>();
});

test("public value exports: pandwind/stack/react", () => {
	expect<ObservedPublicValueExports["./stack/react"]>().type.toBe<
		ExpectedPublicValueExports["./stack/react"]
	>();
});

test("public value exports: pandwind/stack/solid", () => {
	expect<ObservedPublicValueExports["./stack/solid"]>().type.toBe<
		ExpectedPublicValueExports["./stack/solid"]
	>();
});

test("public value exports: pandwind/stack/vue", () => {
	expect<ObservedPublicValueExports["./stack/vue"]>().type.toBe<
		ExpectedPublicValueExports["./stack/vue"]
	>();
});

test("public value exports: pandwind/stack/preact", () => {
	expect<ObservedPublicValueExports["./stack/preact"]>().type.toBe<
		ExpectedPublicValueExports["./stack/preact"]
	>();
});

test("public value exports: pandwind/design", () => {
	expect<ObservedPublicValueExports["./design"]>().type.toBe<
		ExpectedPublicValueExports["./design"]
	>();
});

test("public value exports: pandwind/host", () => {
	expect<ObservedPublicValueExports["./host"]>().type.toBe<ExpectedPublicValueExports["./host"]>();
});

test("public value exports: pandwind/tw", () => {
	expect<ObservedPublicValueExports["./tw"]>().type.toBe<ExpectedPublicValueExports["./tw"]>();
});

test("public value exports: pandwind/tw/collect", () => {
	expect<ObservedPublicValueExports["./tw/collect"]>().type.toBe<
		ExpectedPublicValueExports["./tw/collect"]
	>();
});

test("public value exports: pandwind/vite", () => {
	expect<ObservedPublicValueExports["./vite"]>().type.toBe<ExpectedPublicValueExports["./vite"]>();
});

test("public value exports: pandwind/vite/runtime-pruner", () => {
	expect<ObservedPublicValueExports["./vite/runtime-pruner"]>().type.toBe<
		ExpectedPublicValueExports["./vite/runtime-pruner"]
	>();
});

test("public value exports: pandwind/vite/css-extract", () => {
	expect<ObservedPublicValueExports["./vite/css-extract"]>().type.toBe<
		ExpectedPublicValueExports["./vite/css-extract"]
	>();
});

test("public value exports: pandwind/vite/css-inline-analysis", () => {
	expect<ObservedPublicValueExports["./vite/css-inline-analysis"]>().type.toBe<
		ExpectedPublicValueExports["./vite/css-inline-analysis"]
	>();
});

test("public value exports: pandwind/vite/lib-artifact", () => {
	expect<ObservedPublicValueExports["./vite/lib-artifact"]>().type.toBe<
		ExpectedPublicValueExports["./vite/lib-artifact"]
	>();
});

test("public value exports: pandwind/vite/cross-module-consts", () => {
	expect<ObservedPublicValueExports["./vite/cross-module-consts"]>().type.toBe<
		ExpectedPublicValueExports["./vite/cross-module-consts"]
	>();
});

test("public value exports: pandwind/vite/cx-inline", () => {
	expect<ObservedPublicValueExports["./vite/cx-inline"]>().type.toBe<
		ExpectedPublicValueExports["./vite/cx-inline"]
	>();
});

test("public value exports: pandwind/vite/inline", () => {
	expect<ObservedPublicValueExports["./vite/inline"]>().type.toBe<
		ExpectedPublicValueExports["./vite/inline"]
	>();
});

test("public value exports: pandwind/vite/stack-fold", () => {
	expect<ObservedPublicValueExports["./vite/stack-fold"]>().type.toBe<
		ExpectedPublicValueExports["./vite/stack-fold"]
	>();
});

test("public value exports: pandwind/unplugin", () => {
	expect<ObservedPublicValueExports["./unplugin"]>().type.toBe<
		ExpectedPublicValueExports["./unplugin"]
	>();
});

test("public value exports: pandwind/css/create-stylesheet", () => {
	expect<ObservedPublicValueExports["./css/create-stylesheet"]>().type.toBe<
		ExpectedPublicValueExports["./css/create-stylesheet"]
	>();
});

test("public value exports: pandwind/design/resolve", () => {
	expect<ObservedPublicValueExports["./design/resolve"]>().type.toBe<
		ExpectedPublicValueExports["./design/resolve"]
	>();
});

test("public value exports: pandwind/lib/utils", () => {
	expect<ObservedPublicValueExports["./lib/utils"]>().type.toBe<
		ExpectedPublicValueExports["./lib/utils"]
	>();
});

test("public value exports: pandwind/tw/compile", () => {
	expect<ObservedPublicValueExports["./tw/compile"]>().type.toBe<
		ExpectedPublicValueExports["./tw/compile"]
	>();
});

test("public value exports: pandwind/tw/literal", () => {
	expect<ObservedPublicValueExports["./tw/literal"]>().type.toBe<
		ExpectedPublicValueExports["./tw/literal"]
	>();
});

test("public value exports: pandwind/react-native", () => {
	expect<ObservedPublicValueExports["./react-native"]>().type.toBe<
		ExpectedPublicValueExports["./react-native"]
	>();
});

test("public value exports: pandwind/types/typings", () => {
	expect<ObservedPublicValueExports["./types/typings"]>().type.toBe<
		ExpectedPublicValueExports["./types/typings"]
	>();
});

test("public value exports: pandwind/opentui", () => {
	expect<ObservedPublicValueExports["./opentui"]>().type.toBe<
		ExpectedPublicValueExports["./opentui"]
	>();
});

test("public value exports: pandwind/react-strict-dom", () => {
	expect<ObservedPublicValueExports["./react-strict-dom"]>().type.toBe<
		ExpectedPublicValueExports["./react-strict-dom"]
	>();
});

test("public value exports: pandwind/backends", () => {
	expect<ObservedPublicValueExports["./backends"]>().type.toBe<
		ExpectedPublicValueExports["./backends"]
	>();
});

test("public value exports: pandwind/source", () => {
	expect<ObservedPublicValueExports["./source"]>().type.toBe<
		ExpectedPublicValueExports["./source"]
	>();
});

test("public value exports: pandwind/source/workspace", () => {
	expect<ObservedPublicValueExports["./source/workspace"]>().type.toBe<
		ExpectedPublicValueExports["./source/workspace"]
	>();
});

test("public value exports: pandwind/_runtime/css-base", () => {
	expect<ObservedPublicValueExports["./_runtime/css-base"]>().type.toBe<
		ExpectedPublicValueExports["./_runtime/css-base"]
	>();
});

test("public value exports: pandwind/_runtime/css-codegen", () => {
	expect<ObservedPublicValueExports["./_runtime/css-codegen"]>().type.toBe<
		ExpectedPublicValueExports["./_runtime/css-codegen"]
	>();
});

test("public value exports: pandwind/_runtime/css-preset", () => {
	expect<ObservedPublicValueExports["./_runtime/css-preset"]>().type.toBe<
		ExpectedPublicValueExports["./_runtime/css-preset"]
	>();
});

test("public value exports: pandwind/_runtime/css-design", () => {
	expect<ObservedPublicValueExports["./_runtime/css-design"]>().type.toBe<
		ExpectedPublicValueExports["./_runtime/css-design"]
	>();
});

test("public value exports: pandwind/_runtime/css-class", () => {
	expect<ObservedPublicValueExports["./_runtime/css-class"]>().type.toBe<
		ExpectedPublicValueExports["./_runtime/css-class"]
	>();
});

test("public value exports: pandwind/_runtime/css-vars", () => {
	expect<ObservedPublicValueExports["./_runtime/css-vars"]>().type.toBe<
		ExpectedPublicValueExports["./_runtime/css-vars"]
	>();
});

test("public value exports: pandwind/_runtime/css-raw", () => {
	expect<ObservedPublicValueExports["./_runtime/css-raw"]>().type.toBe<
		ExpectedPublicValueExports["./_runtime/css-raw"]
	>();
});

test("public value exports: pandwind/_runtime/css-props", () => {
	expect<ObservedPublicValueExports["./_runtime/css-props"]>().type.toBe<
		ExpectedPublicValueExports["./_runtime/css-props"]
	>();
});

test("public value exports: pandwind/_runtime/css-group", () => {
	expect<ObservedPublicValueExports["./_runtime/css-group"]>().type.toBe<
		ExpectedPublicValueExports["./_runtime/css-group"]
	>();
});

test("public value exports: pandwind/_runtime/css-input", () => {
	expect<ObservedPublicValueExports["./_runtime/css-input"]>().type.toBe<
		ExpectedPublicValueExports["./_runtime/css-input"]
	>();
});

test("public value exports: pandwind/_runtime/css-keyframes", () => {
	expect<ObservedPublicValueExports["./_runtime/css-keyframes"]>().type.toBe<
		ExpectedPublicValueExports["./_runtime/css-keyframes"]
	>();
});
