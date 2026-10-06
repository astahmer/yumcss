import { expect, test } from "tstyche";

declare const noValueExports: unique symbol;

type PublicValueExports = {
	".": keyof typeof import("yumcss");
	"./css": keyof typeof import("yumcss/css");
	"./css/generated": keyof typeof import("yumcss/css/generated");
	"./css/named": keyof typeof import("yumcss/css/named");
	"./unsafe/css": keyof typeof import("yumcss/unsafe/css");
	"./css/runtime": keyof typeof import("yumcss/css/runtime");
	"./css/selector-scan": keyof typeof import("yumcss/css/selector-scan");
	"./css/stylex": keyof typeof import("yumcss/css/stylex");
	"./css/panda": keyof typeof import("yumcss/css/panda");
	"./css/unocss": keyof typeof import("yumcss/css/unocss");
	"./cx": keyof typeof import("yumcss/cx");
	"./preset": keyof typeof import("yumcss/preset");
	"./preset/csstype": keyof typeof import("yumcss/preset/csstype");
	"./preset/default": keyof typeof import("yumcss/preset/default");
	"./preset/tailwindcss": keyof typeof import("yumcss/preset/tailwindcss");
	"./preset/chakra": keyof typeof import("yumcss/preset/chakra");
	"./preset/shadcn": keyof typeof import("yumcss/preset/shadcn");
	"./preset/panda": keyof typeof import("yumcss/preset/panda");
	"./stack": keyof typeof import("yumcss/stack");
	"./stack/react": keyof typeof import("yumcss/stack/react");
	"./stack/solid": keyof typeof import("yumcss/stack/solid");
	"./stack/vue": keyof typeof import("yumcss/stack/vue");
	"./stack/preact": keyof typeof import("yumcss/stack/preact");
	"./design": keyof typeof import("yumcss/design");
	"./host": keyof typeof import("yumcss/host");
	"./tw": keyof typeof import("yumcss/tw");
	"./tw/collect": keyof typeof import("yumcss/tw/collect");
	"./vite": keyof typeof import("yumcss/vite");
	"./vite/runtime-pruner": keyof typeof import("yumcss/vite/runtime-pruner");
	"./vite/css-extract": keyof typeof import("yumcss/vite/css-extract");
	"./vite/css-inline-analysis": keyof typeof import("yumcss/vite/css-inline-analysis");
	"./vite/lib-artifact": keyof typeof import("yumcss/vite/lib-artifact");
	"./vite/cross-module-consts": keyof typeof import("yumcss/vite/cross-module-consts");
	"./vite/cx-inline": keyof typeof import("yumcss/vite/cx-inline");
	"./vite/inline": keyof typeof import("yumcss/vite/inline");
	"./vite/stack-fold": keyof typeof import("yumcss/vite/stack-fold");
	"./unplugin": keyof typeof import("yumcss/unplugin");
	"./css/create-stylesheet": keyof typeof import("yumcss/css/create-stylesheet");
	"./design/resolve": keyof typeof import("yumcss/design/resolve");
	"./lib/utils": keyof typeof import("yumcss/lib/utils");
	"./tw/compile": keyof typeof import("yumcss/tw/compile");
	"./tw/literal": keyof typeof import("yumcss/tw/literal");
	"./react-native": keyof typeof import("yumcss/react-native");
	"./types/typings": keyof typeof import("yumcss/types/typings");
	"./opentui": keyof typeof import("yumcss/opentui");
	"./react-strict-dom": keyof typeof import("yumcss/react-strict-dom");
	"./backends": keyof typeof import("yumcss/backends");
	"./source": keyof typeof import("yumcss/source");
	"./source/workspace": keyof typeof import("yumcss/source/workspace");
	"./_runtime/css-base": keyof typeof import("yumcss/_runtime/css-base");
	"./_runtime/css-codegen": keyof typeof import("yumcss/_runtime/css-codegen");
	"./_runtime/css-preset": keyof typeof import("yumcss/_runtime/css-preset");
	"./_runtime/css-design": keyof typeof import("yumcss/_runtime/css-design");
	"./_runtime/css-class": keyof typeof import("yumcss/_runtime/css-class");
	"./_runtime/css-vars": keyof typeof import("yumcss/_runtime/css-vars");
	"./_runtime/css-raw": keyof typeof import("yumcss/_runtime/css-raw");
	"./_runtime/css-props": keyof typeof import("yumcss/_runtime/css-props");
	"./_runtime/css-group": keyof typeof import("yumcss/_runtime/css-group");
	"./_runtime/css-input": keyof typeof import("yumcss/_runtime/css-input");
	"./_runtime/css-keyframes": keyof typeof import("yumcss/_runtime/css-keyframes");
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
		| "YUMCSS_LIB_COMPILER"
		| "YUMCSS_LIB_GENERATOR"
		| "YUMCSS_LIB_SCHEMA"
		| "checkYumCSSLibCompatibility"
		| "createInlineTwPluginCore"
		| "createYumCSSEngineContext"
		| "createYumCSSLibArtifact"
		| "createYumCSSLibCompatibility"
		| "foldStackElements"
		| "hashYumCSSLibSource"
		| "yumcssExtractVite"
		| "yumcssVite"
		| "stackFoldVite"
		| "validateYumCSSLibArtifact"
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
		| "YUMCSS_LIB_COMPILER"
		| "YUMCSS_LIB_GENERATOR"
		| "YUMCSS_LIB_SCHEMA"
		| "checkYumCSSLibCompatibility"
		| "createYumCSSLibArtifact"
		| "createYumCSSLibCompatibility"
		| "hashYumCSSLibSource"
		| "validateYumCSSLibArtifact"
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
		| "yumcssRollup"
		| "yumcssRollupCss"
		| "yumcssUnplugin"
		| "yumcssUnpluginCss"
		| "yumcssWebpack"
		| "yumcssWebpackCss"
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
		import("yumcss").CxFn,
		import("yumcss").CxInput,
		import("yumcss").CxOptions,
		import("yumcss").TwAdapterOptions,
		import("yumcss").TwComposeMeta,
		import("yumcss").TwConflictsMeta,
		import("yumcss").TwDirectionalConflictsMeta,
		import("yumcss").TwNestedStyles,
		import("yumcss").TwOptions,
		import("yumcss").TwValue,
		import("yumcss").TwVariantsMeta,
		import("yumcss").UtilityBridge,
		import("yumcss").VarAtom,
		import("yumcss").VarsOutput,
	];
	"./css": readonly [
		import("yumcss/css").AtomicStyleProps<never>,
		import("yumcss/css").ClassNameStrategy,
		import("yumcss/css").CreateCssOptions,
		import("yumcss/css").CssCascade,
		import("yumcss/css").CssCascadeLayerOptions,
		import("yumcss/css").CssCascadeMode,
		import("yumcss/css").CssFn<never, never, never>,
		import("yumcss/css").FirstThatWorksValue,
	];
	"./css/generated": readonly [];
	"./css/named": readonly [];
	"./unsafe/css": readonly [
		import("yumcss/unsafe/css").CreateCssOptions,
		import("yumcss/unsafe/css").CssFn<never, never, never>,
	];
	"./css/runtime": readonly [
		import("yumcss/css/runtime").RuntimeCssFn<never, never, never, never, never, never>,
		import("yumcss/css/runtime").RuntimeCssOptions,
		import("yumcss/css/runtime").RuntimeDeclaration,
		import("yumcss/css/runtime").RuntimeDocument,
		import("yumcss/css/runtime").RuntimeOrderingPolicy,
		import("yumcss/css/runtime").RuntimeRule,
		import("yumcss/css/runtime").RuntimeRuleCanonicalizer,
		import("yumcss/css/runtime").RuntimeRuleSerializer,
		import("yumcss/css/runtime").RuntimeSemanticRule,
		import("yumcss/css/runtime").RuntimeSemanticRuleKind,
		import("yumcss/css/runtime").RuntimeSheet,
		import("yumcss/css/runtime").RuntimeSheetOptions,
		import("yumcss/css/runtime").RuntimeSheetSnapshot,
		import("yumcss/css/runtime").RuntimeStyleElementSink,
	];
	"./css/selector-scan": readonly [import("yumcss/css/selector-scan").SelectorClassMatch];
	"./css/stylex": readonly [import("yumcss/css/stylex").StyleXAdapterOptions];
	"./css/panda": readonly [import("yumcss/css/panda").PandaAdapterOptions];
	"./css/unocss": readonly [import("yumcss/css/unocss").UnoCssAdapterOptions];
	"./cx": readonly [
		import("yumcss/cx").CxFn,
		import("yumcss/cx").CxInput,
		import("yumcss/cx").CxOptions,
		import("yumcss/cx").VarAtom,
		import("yumcss/cx").VarsOutput,
	];
	"./preset": readonly [
		import("yumcss/preset").AnyConditions,
		import("yumcss/preset").AnyCssConfig,
		import("yumcss/preset").AnyPresetProperties<never, never>,
		import("yumcss/preset").AnySemanticTokens<never>,
		import("yumcss/preset").AnySimpleTokens,
		import("yumcss/preset").AnyTokens,
		import("yumcss/preset").ColorPaletteDefinitions<never>,
		import("yumcss/preset").ColorPaletteSource<never>,
		import("yumcss/preset").CssConfigReturn<never>,
		import("yumcss/preset").CssPreset<never, never, never, never, never>,
		import("yumcss/preset").CsstypePreset,
		import("yumcss/preset").CsstypeProperties,
		import("yumcss/preset").CssVariableDescriptor,
		import("yumcss/preset").CssVariables,
		import("yumcss/preset").CssVariableValue,
		import("yumcss/preset").CssWideValue,
		import("yumcss/preset").DefaultPreset,
		import("yumcss/preset").DefinePresetOptions<never, never>,
		import("yumcss/preset").DynamicStyleObject,
		import("yumcss/preset").DynamicStyleValue,
		import("yumcss/preset").YumCSSCssValue,
		import("yumcss/preset").YumCSSProperties,
		import("yumcss/preset").PresetConditions,
		import("yumcss/preset").PresetWeb,
		import("yumcss/preset").PresetWebFontFace,
		import("yumcss/preset").PresetWebKeyframeBody,
		import("yumcss/preset").PresetWebStyleObject,
		import("yumcss/preset").PresetWebValue,
		import("yumcss/preset").SemanticToken<never>,
		import("yumcss/preset").SimpleToken,
		import("yumcss/preset").StyleObject,
		import("yumcss/preset").StyleValue,
		import("yumcss/preset").Token<never>,
		import("yumcss/preset").TokenCatalog<never>,
		import("yumcss/preset").TokenDeclaration,
		import("yumcss/preset").TokenGroup<never, never>,
		import("yumcss/preset").TokenGroupKey<never>,
		import("yumcss/preset").TokenReference<never>,
		import("yumcss/preset").Tokens,
		import("yumcss/preset").TokenVariableNames,
		import("yumcss/preset").TokenVariables,
		import("yumcss/preset").TypedDynamicStyleObject<never>,
		import("yumcss/preset").TypedRawStyleObject<never>,
		import("yumcss/preset").TypedStyleObject<never, never>,
	];
	"./preset/csstype": readonly [
		import("yumcss/preset/csstype").CsstypePreset,
		import("yumcss/preset/csstype").CsstypeProperties,
	];
	"./preset/default": readonly [import("yumcss/preset/default").DefaultPreset];
	"./preset/tailwindcss": readonly [
		import("yumcss/preset/tailwindcss").TailwindConditions,
		import("yumcss/preset/tailwindcss").TailwindPreset,
		import("yumcss/preset/tailwindcss").TailwindProperties,
		import("yumcss/preset/tailwindcss").TailwindTokens,
	];
	"./preset/chakra": readonly [
		import("yumcss/preset/chakra").ChakraConditions,
		import("yumcss/preset/chakra").ChakraCssConfig,
		import("yumcss/preset/chakra").ChakraExtraProperty,
		import("yumcss/preset/chakra").ChakraPreset,
		import("yumcss/preset/chakra").ChakraProperties,
		import("yumcss/preset/chakra").ChakraTokens,
	];
	"./preset/shadcn": readonly [
		import("yumcss/preset/shadcn").ShadcnBaseColor,
		import("yumcss/preset/shadcn").ShadcnBaseColorLightVariables,
		import("yumcss/preset/shadcn").ShadcnColorRole,
		import("yumcss/preset/shadcn").ShadcnColorToken,
		import("yumcss/preset/shadcn").ShadcnColorTokens,
		import("yumcss/preset/shadcn").ShadcnConditions,
		import("yumcss/preset/shadcn").ShadcnConfig,
		import("yumcss/preset/shadcn").ShadcnDeclarations,
		import("yumcss/preset/shadcn").ShadcnFontHeadingName,
		import("yumcss/preset/shadcn").ShadcnFontName,
		import("yumcss/preset/shadcn").ShadcnMenuAccent,
		import("yumcss/preset/shadcn").ShadcnMenuColor,
		import("yumcss/preset/shadcn").ShadcnPreset,
		import("yumcss/preset/shadcn").ShadcnPresetOptions,
		import("yumcss/preset/shadcn").ShadcnProperties,
		import("yumcss/preset/shadcn").ShadcnRadiusName,
		import("yumcss/preset/shadcn").ShadcnStyleName,
		import("yumcss/preset/shadcn").ShadcnThemeName,
		import("yumcss/preset/shadcn").ShadcnTokens,
	];
	"./preset/panda": readonly [
		import("yumcss/preset/panda").PandaConditions,
		import("yumcss/preset/panda").PandaCssConfig,
		import("yumcss/preset/panda").PandaExtraProperty,
		import("yumcss/preset/panda").PandaPreset,
		import("yumcss/preset/panda").PandaProperties,
		import("yumcss/preset/panda").PandaTokens,
	];
	"./stack": readonly [
		import("yumcss/stack").StackAlign,
		import("yumcss/stack").StackClassCompiler,
		import("yumcss/stack").StackClassName,
		import("yumcss/stack").StackCssValue,
		import("yumcss/stack").StackDirection,
		import("yumcss/stack").StackJustify,
		import("yumcss/stack").StackProps,
		import("yumcss/stack").StackResponsiveValue<never>,
		import("yumcss/stack").StackStyle,
	];
	"./stack/react": readonly [
		import("yumcss/stack/react").StackComponentProps,
		import("yumcss/stack/react").StackProps,
	];
	"./stack/solid": readonly [import("yumcss/stack/solid").StackComponentProps];
	"./stack/vue": readonly [import("yumcss/stack/vue").StackComponentProps];
	"./stack/preact": readonly [import("yumcss/stack/preact").StackComponentProps];
	"./design": readonly [
		import("yumcss/design").DesignDynamicStyleObject<never>,
		import("yumcss/design").DesignPreset,
		import("yumcss/design").DesignStyleObject<never>,
	];
	"./host": readonly [
		import("yumcss/host").BuiltinHostFramework,
		import("yumcss/host").HostFramework,
		import("yumcss/host").HostStyleAdapter,
		import("yumcss/host").HostStylePlugin,
		import("yumcss/host").HostStyleRegistry,
	];
	"./tw": readonly [
		import("yumcss/tw").TwAdapterOptions,
		import("yumcss/tw").TwComposeMeta,
		import("yumcss/tw").TwConflictsMeta,
		import("yumcss/tw").TwDirectionalConflictsMeta,
		import("yumcss/tw").TwNestedStyles,
		import("yumcss/tw").TwOptions,
		import("yumcss/tw").TwValue,
		import("yumcss/tw").TwVariantsMeta,
		import("yumcss/tw").UtilityBridge,
	];
	"./tw/collect": readonly [
		import("yumcss/tw/collect").TwClassCollector,
		import("yumcss/tw/collect").TwCollectResult,
		import("yumcss/tw/collect").TwScanOptions,
		import("yumcss/tw/collect").TwScanResult,
	];
	"./vite": readonly [
		import("yumcss/vite").InlineTwPluginCore,
		import("yumcss/vite").YumCSSExtractViteOptions,
		import("yumcss/vite").YumCSSEngineContext,
		import("yumcss/vite").YumCSSEngineContextOptions,
		import("yumcss/vite").YumCSSLibArtifact,
		import("yumcss/vite").YumCSSLibArtifactInput,
		import("yumcss/vite").YumCSSLibCompatibility,
		import("yumcss/vite").YumCSSLibCompatibilityCheck,
		import("yumcss/vite").YumCSSLibCompatibilityOptions,
		import("yumcss/vite").YumCSSLibRule,
		import("yumcss/vite").YumCSSLibSource,
		import("yumcss/vite").YumCSSLibValidation,
		import("yumcss/vite").YumCSSViteOptions,
		import("yumcss/vite").Resolver,
		import("yumcss/vite").StackFoldOptions,
	];
	"./vite/runtime-pruner": readonly [
		import("yumcss/vite/runtime-pruner").RuntimePruningExplanation,
		import("yumcss/vite/runtime-pruner").RuntimePruningExplanationOptions,
		import("yumcss/vite/runtime-pruner").RuntimePruningOptions,
		import("yumcss/vite/runtime-pruner").RuntimePruningStatus,
		import("yumcss/vite/runtime-pruner").RuntimePruningTransform,
	];
	"./vite/css-extract": readonly [
		import("yumcss/vite/css-extract").AuthoredCssImport,
		import("yumcss/vite/css-extract").CssCallSite,
		import("yumcss/vite/css-extract").CssDiagnostic,
		import("yumcss/vite/css-extract").CssDiagnosticKind,
		import("yumcss/vite/css-extract").CssExtractionServiceOptions,
		import("yumcss/vite/css-extract").CssFileExtraction,
		import("yumcss/vite/css-extract").CssPreset,
		import("yumcss/vite/css-extract").CssSourceInspection,
		import("yumcss/vite/css-extract").CssSourceProvenance,
		import("yumcss/vite/css-extract").CssSourceScanner,
		import("yumcss/vite/css-extract").ExtractedCssStyle,
		import("yumcss/vite/css-extract").InlineCssResult,
	];
	"./vite/css-inline-analysis": readonly [
		import("yumcss/vite/css-inline-analysis").CssInlineAnalysis,
		import("yumcss/vite/css-inline-analysis").CssInlineAnalysisOptions,
		import("yumcss/vite/css-inline-analysis").CssInlineArgumentAnalysis,
		import("yumcss/vite/css-inline-analysis").CssInlineEntry,
		import("yumcss/vite/css-inline-analysis").CssInlineResidual,
		import("yumcss/vite/css-inline-analysis").CssInlineResidualCode,
		import("yumcss/vite/css-inline-analysis").InlineAstNode,
		import("yumcss/vite/css-inline-analysis").LiteralCallEvaluator,
		import("yumcss/vite/css-inline-analysis").LiteralConstantScope,
		import("yumcss/vite/css-inline-analysis").OxcNode,
	];
	"./vite/lib-artifact": readonly [
		import("yumcss/vite/lib-artifact").YumCSSLibArtifact,
		import("yumcss/vite/lib-artifact").YumCSSLibArtifactInput,
		import("yumcss/vite/lib-artifact").YumCSSLibCompatibility,
		import("yumcss/vite/lib-artifact").YumCSSLibCompatibilityCheck,
		import("yumcss/vite/lib-artifact").YumCSSLibCompatibilityOptions,
		import("yumcss/vite/lib-artifact").YumCSSLibRule,
		import("yumcss/vite/lib-artifact").YumCSSLibSource,
		import("yumcss/vite/lib-artifact").YumCSSLibValidation,
	];
	"./vite/cross-module-consts": readonly [
		import("yumcss/vite/cross-module-consts").CrossModuleResolver,
		import("yumcss/vite/cross-module-consts").CrossModuleResolverOptions,
		import("yumcss/vite/cross-module-consts").ImportBinding,
		import("yumcss/vite/cross-module-consts").ModuleExportAnalysis,
	];
	"./vite/cx-inline": readonly [
		import("yumcss/vite/cx-inline").ConstantScope,
		import("yumcss/vite/cx-inline").CxCompilerOptions,
		import("yumcss/vite/cx-inline").CxCompilerPorts,
		import("yumcss/vite/cx-inline").CxFoldContext,
		import("yumcss/vite/cx-inline").CxImportInfo,
		import("yumcss/vite/cx-inline").InlineCxCallsOptions,
		import("yumcss/vite/cx-inline").InlineResult,
		import("yumcss/vite/cx-inline").KnownConstant,
		import("yumcss/vite/cx-inline").StaticEval,
	];
	"./vite/inline": readonly [
		import("yumcss/vite/inline").InlineResult,
		import("yumcss/vite/inline").OnUnresolved,
		import("yumcss/vite/inline").TwConfig,
		import("yumcss/vite/inline").UnresolvedOptions,
	];
	"./vite/stack-fold": readonly [import("yumcss/vite/stack-fold").StackFoldOptions];
	"./unplugin": readonly [
		import("yumcss/unplugin").YumCSSUnpluginCssOptions,
		import("yumcss/unplugin").YumCSSUnpluginOptions,
	];
	"./css/create-stylesheet": readonly [
		import("yumcss/css/create-stylesheet").PreparedStyle,
		import("yumcss/css/create-stylesheet").StylesheetPolicies,
	];
	"./design/resolve": readonly [
		import("yumcss/design/resolve").DefaultDesignModuleRegistry,
		import("yumcss/design/resolve").DesignModuleAdapter,
		import("yumcss/design/resolve").DesignModuleContext,
		import("yumcss/design/resolve").DesignModuleRegistry,
		import("yumcss/design/resolve").DesignStyleResolver,
		import("yumcss/design/resolve").TokenLookup,
	];
	"./lib/utils": readonly [import("yumcss/lib/utils").FlatStyles];
	"./tw/compile": readonly [
		import("yumcss/tw/compile").TwComposeMeta,
		import("yumcss/tw/compile").TwConflictsMeta,
		import("yumcss/tw/compile").TwDirectionalConflictsMeta,
		import("yumcss/tw/compile").TwNestedStyles,
		import("yumcss/tw/compile").TwValue,
		import("yumcss/tw/compile").TwValueTokensMeta,
		import("yumcss/tw/compile").TwVariantsMeta,
	];
	"./tw/literal": readonly [
		import("yumcss/tw/literal").LiteralCallEvaluator,
		import("yumcss/tw/literal").LiteralConstantScope,
		import("yumcss/tw/literal").LiteralValueSet,
		import("yumcss/tw/literal").OxcNode,
		import("yumcss/tw/literal").OxcParentVisitor,
	];
	"./react-native": readonly [
		import("yumcss/react-native").ObjectBackend,
		import("yumcss/react-native").ObjectCssFn<never>,
		import("yumcss/react-native").ObjectCxFn,
		import("yumcss/react-native").RnCssFn<never>,
		import("yumcss/react-native").RnStyle,
		import("yumcss/react-native").TargetStyle,
	];
	"./types/typings": readonly [
		import("yumcss/types/typings").AnyConditions,
		import("yumcss/types/typings").AnyCssConfig,
		import("yumcss/types/typings").AnyPresetProperties<never, never>,
		import("yumcss/types/typings").AnySemanticTokens<never>,
		import("yumcss/types/typings").AnySimpleTokens,
		import("yumcss/types/typings").AnyTokens,
		import("yumcss/types/typings").ColorPaletteDefinitions<never>,
		import("yumcss/types/typings").ColorPaletteSource<never>,
		import("yumcss/types/typings").CssConfigReturn<never>,
		import("yumcss/types/typings").CssPreset<never, never, never, never, never>,
		import("yumcss/types/typings").CssVariableDescriptor,
		import("yumcss/types/typings").CssVariables,
		import("yumcss/types/typings").CssVariableValue,
		import("yumcss/types/typings").CssWideValue,
		import("yumcss/types/typings").DefinePresetOptions<never, never>,
		import("yumcss/types/typings").DynamicStyleObject,
		import("yumcss/types/typings").DynamicStyleValue,
		import("yumcss/types/typings").PresetWeb,
		import("yumcss/types/typings").PresetWebFontFace,
		import("yumcss/types/typings").PresetWebKeyframeBody,
		import("yumcss/types/typings").PresetWebStyleObject,
		import("yumcss/types/typings").PresetWebValue,
		import("yumcss/types/typings").SemanticToken<never>,
		import("yumcss/types/typings").SimpleToken,
		import("yumcss/types/typings").StyleObject,
		import("yumcss/types/typings").StyleValue,
		import("yumcss/types/typings").Token<never>,
		import("yumcss/types/typings").TokenCatalog<never>,
		import("yumcss/types/typings").TokenDeclaration,
		import("yumcss/types/typings").TokenGroup<never, never>,
		import("yumcss/types/typings").TokenGroupKey<never>,
		import("yumcss/types/typings").TokenReference<never>,
		import("yumcss/types/typings").TokenVariableNames,
		import("yumcss/types/typings").TokenVariables,
		import("yumcss/types/typings").TypedDynamicStyleObject<never>,
		import("yumcss/types/typings").TypedRawStyleObject<never>,
		import("yumcss/types/typings").TypedStyleObject<never, never>,
	];
	"./opentui": readonly [
		import("yumcss/opentui").ObjectBackend,
		import("yumcss/opentui").ObjectCssFn<never>,
		import("yumcss/opentui").ObjectCxFn,
		import("yumcss/opentui").OpentuiCssFn<never>,
		import("yumcss/opentui").OpentuiStyle,
		import("yumcss/opentui").TargetStyle,
	];
	"./react-strict-dom": readonly [
		import("yumcss/react-strict-dom").ReactStrictDomBackend,
		import("yumcss/react-strict-dom").ReactStrictDomBackendOptions,
		import("yumcss/react-strict-dom").ReactStrictDomCompiledStyle,
		import("yumcss/react-strict-dom").ReactStrictDomCssFn<never, never>,
		import("yumcss/react-strict-dom").ReactStrictDomCxFn<never>,
		import("yumcss/react-strict-dom").ReactStrictDomDesignCssFn<never, never>,
		import("yumcss/react-strict-dom").ReactStrictDomNativeBackendOptions,
		import("yumcss/react-strict-dom").ReactStrictDomNativeStyle,
		import("yumcss/react-strict-dom").ReactStrictDomPlatform,
		import("yumcss/react-strict-dom").ReactStrictDomPlatformType,
		import("yumcss/react-strict-dom").ReactStrictDomStyle,
		import("yumcss/react-strict-dom").ReactStrictDomStyleFor<never>,
		import("yumcss/react-strict-dom").ReactStrictDomWebBackendOptions,
	];
	"./backends": readonly [
		import("yumcss/backends").BackendArtifactKind,
		import("yumcss/backends").BackendCapabilityContract,
		import("yumcss/backends").BackendCapabilityLevel,
		import("yumcss/backends").BackendDeclarationIssue,
		import("yumcss/backends").BackendFeature,
		import("yumcss/backends").BackendLossiness,
		import("yumcss/backends").BuiltinBackendId,
		import("yumcss/backends").CssBackendOptions,
		import("yumcss/backends").FlatStyleIR,
		import("yumcss/backends").ObjectBackend,
		import("yumcss/backends").ObjectBackendOptions,
		import("yumcss/backends").ObjectCssFn<never>,
		import("yumcss/backends").ObjectCxFn,
		import("yumcss/backends").OpentuiBackendOptions,
		import("yumcss/backends").ReactStrictDomBackend,
		import("yumcss/backends").ReactStrictDomBackendOptions,
		import("yumcss/backends").ReactStrictDomCompiledStyle,
		import("yumcss/backends").ReactStrictDomNativeBackendOptions,
		import("yumcss/backends").ReactStrictDomPlatform,
		import("yumcss/backends").ReactStrictDomPlatformType,
		import("yumcss/backends").ReactStrictDomStyle,
		import("yumcss/backends").ReactStrictDomWebBackendOptions,
		import("yumcss/backends").RnBackendOptions,
		import("yumcss/backends").StyleBackend<never>,
		import("yumcss/backends").StyleBackendContractFailure,
		import("yumcss/backends").StyleBackendContractFixture,
		import("yumcss/backends").StyleBackendContractPhase,
		import("yumcss/backends").StyleBackendContractResult,
		import("yumcss/backends").StyleBackendContractSuite,
		import("yumcss/backends").StyleBackendFactory<never, never>,
		import("yumcss/backends").StyleBackendId,
		import("yumcss/backends").StyleBackendRegistry,
		import("yumcss/backends").TargetStyle,
	];
	"./source": readonly [
		import("yumcss/source").SourceBinding,
		import("yumcss/source").SourceBindingIndex,
		import("yumcss/source").SourceBindingKind,
		import("yumcss/source").SourceBindings,
		import("yumcss/source").SourceCallSite,
		import("yumcss/source").SourceCallSiteKind,
		import("yumcss/source").SourceDocument,
		import("yumcss/source").SourceExportAll,
		import("yumcss/source").SourceFramework,
		import("yumcss/source").SourceHostUse,
		import("yumcss/source").SourceHostUseKind,
		import("yumcss/source").SourceLanguage,
		import("yumcss/source").SourceLanguageAdapter,
		import("yumcss/source").SourceLanguageAdapterId,
		import("yumcss/source").SourceProjectBindingIndex,
		import("yumcss/source").SourceProjectBindingLoader,
		import("yumcss/source").SourceRange,
		import("yumcss/source").SourceReexport,
		import("yumcss/source").SourceRuntimeBoundary,
		import("yumcss/source").SourceScanDiagnostic,
		import("yumcss/source").SourceScannerContractFailure,
		import("yumcss/source").SourceScannerContractFixture,
		import("yumcss/source").SourceScannerContractResult,
		import("yumcss/source").SourceScannerContractSuite,
		import("yumcss/source").SourceScannerPlugin,
		import("yumcss/source").SourceScannerRegistry,
		import("yumcss/source").SourceScannerService,
		import("yumcss/source").SourceScanResult,
	];
	"./source/workspace": readonly [
		import("yumcss/source/workspace").SourceWorkspace,
		import("yumcss/source/workspace").SourceWorkspaceFile,
		import("yumcss/source/workspace").SourceWorkspaceFileSystem,
		import("yumcss/source/workspace").SourceWorkspaceGlobOptions,
		import("yumcss/source/workspace").SourceWorkspaceOptions,
		import("yumcss/source/workspace").SourceWorkspaceQuery,
	];
	"./_runtime/css-base": readonly [
		import("yumcss/_runtime/css-base").AnyInput,
		import("yumcss/_runtime/css-base").CompiledStyles,
		import("yumcss/_runtime/css-base").CreateCssOptions,
		import("yumcss/_runtime/css-base").CssStyle,
		import("yumcss/_runtime/css-base").DynamicFn<never>,
		import("yumcss/_runtime/css-base").DynamicReturn,
		import("yumcss/_runtime/css-base").DynamicStyles<never, never>,
		import("yumcss/_runtime/css-base").RuntimeCssAttachment,
		import("yumcss/_runtime/css-base").RuntimeCssContext,
		import("yumcss/_runtime/css-base").RuntimeCssFunction,
		import("yumcss/_runtime/css-base").TypedPreset,
		import("yumcss/_runtime/css-base").TypedRuntimeCssFunction<never>,
	];
	"./_runtime/css-codegen": readonly [
		import("yumcss/_runtime/css-codegen").CssRuntimeFactory,
		import("yumcss/_runtime/css-codegen").CssRuntimeMethod,
		import("yumcss/_runtime/css-codegen").RenderCssRuntimeModuleOptions,
	];
	"./_runtime/css-preset": readonly [import("yumcss/_runtime/css-preset").TypedPreset];
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

test("public value exports: yumcss", () => {
	expect<ObservedPublicValueExports["."]>().type.toBe<ExpectedPublicValueExports["."]>();
});

test("public value exports: yumcss/css", () => {
	expect<ObservedPublicValueExports["./css"]>().type.toBe<ExpectedPublicValueExports["./css"]>();
});

test("public value exports: yumcss/css/generated", () => {
	expect<ObservedPublicValueExports["./css/generated"]>().type.toBe<
		ExpectedPublicValueExports["./css/generated"]
	>();
});

test("public value exports: yumcss/css/named", () => {
	expect<ObservedPublicValueExports["./css/named"]>().type.toBe<
		ExpectedPublicValueExports["./css/named"]
	>();
});

test("public value exports: yumcss/unsafe/css", () => {
	expect<ObservedPublicValueExports["./unsafe/css"]>().type.toBe<
		ExpectedPublicValueExports["./unsafe/css"]
	>();
});

test("public value exports: yumcss/css/runtime", () => {
	expect<ObservedPublicValueExports["./css/runtime"]>().type.toBe<
		ExpectedPublicValueExports["./css/runtime"]
	>();
});

test("public value exports: yumcss/css/selector-scan", () => {
	expect<ObservedPublicValueExports["./css/selector-scan"]>().type.toBe<
		ExpectedPublicValueExports["./css/selector-scan"]
	>();
});

test("public value exports: yumcss/css/stylex", () => {
	expect<ObservedPublicValueExports["./css/stylex"]>().type.toBe<
		ExpectedPublicValueExports["./css/stylex"]
	>();
});

test("public value exports: yumcss/css/panda", () => {
	expect<ObservedPublicValueExports["./css/panda"]>().type.toBe<
		ExpectedPublicValueExports["./css/panda"]
	>();
});

test("public value exports: yumcss/css/unocss", () => {
	expect<ObservedPublicValueExports["./css/unocss"]>().type.toBe<
		ExpectedPublicValueExports["./css/unocss"]
	>();
});

test("public value exports: yumcss/cx", () => {
	expect<ObservedPublicValueExports["./cx"]>().type.toBe<ExpectedPublicValueExports["./cx"]>();
});

test("public value exports: yumcss/preset", () => {
	expect<ObservedPublicValueExports["./preset"]>().type.toBe<
		ExpectedPublicValueExports["./preset"]
	>();
});

test("public value exports: yumcss/preset/csstype", () => {
	expect<ObservedPublicValueExports["./preset/csstype"]>().type.toBe<
		ExpectedPublicValueExports["./preset/csstype"]
	>();
});

test("public value exports: yumcss/preset/default", () => {
	expect<ObservedPublicValueExports["./preset/default"]>().type.toBe<
		ExpectedPublicValueExports["./preset/default"]
	>();
});

test("public value exports: yumcss/preset/tailwindcss", () => {
	expect<ObservedPublicValueExports["./preset/tailwindcss"]>().type.toBe<
		ExpectedPublicValueExports["./preset/tailwindcss"]
	>();
});

test("public value exports: yumcss/preset/chakra", () => {
	expect<ObservedPublicValueExports["./preset/chakra"]>().type.toBe<
		ExpectedPublicValueExports["./preset/chakra"]
	>();
});

test("public value exports: yumcss/preset/shadcn", () => {
	expect<ObservedPublicValueExports["./preset/shadcn"]>().type.toBe<
		ExpectedPublicValueExports["./preset/shadcn"]
	>();
});

test("public value exports: yumcss/preset/panda", () => {
	expect<ObservedPublicValueExports["./preset/panda"]>().type.toBe<
		ExpectedPublicValueExports["./preset/panda"]
	>();
});

test("public value exports: yumcss/stack", () => {
	expect<ObservedPublicValueExports["./stack"]>().type.toBe<
		ExpectedPublicValueExports["./stack"]
	>();
});

test("public value exports: yumcss/stack/react", () => {
	expect<ObservedPublicValueExports["./stack/react"]>().type.toBe<
		ExpectedPublicValueExports["./stack/react"]
	>();
});

test("public value exports: yumcss/stack/solid", () => {
	expect<ObservedPublicValueExports["./stack/solid"]>().type.toBe<
		ExpectedPublicValueExports["./stack/solid"]
	>();
});

test("public value exports: yumcss/stack/vue", () => {
	expect<ObservedPublicValueExports["./stack/vue"]>().type.toBe<
		ExpectedPublicValueExports["./stack/vue"]
	>();
});

test("public value exports: yumcss/stack/preact", () => {
	expect<ObservedPublicValueExports["./stack/preact"]>().type.toBe<
		ExpectedPublicValueExports["./stack/preact"]
	>();
});

test("public value exports: yumcss/design", () => {
	expect<ObservedPublicValueExports["./design"]>().type.toBe<
		ExpectedPublicValueExports["./design"]
	>();
});

test("public value exports: yumcss/host", () => {
	expect<ObservedPublicValueExports["./host"]>().type.toBe<ExpectedPublicValueExports["./host"]>();
});

test("public value exports: yumcss/tw", () => {
	expect<ObservedPublicValueExports["./tw"]>().type.toBe<ExpectedPublicValueExports["./tw"]>();
});

test("public value exports: yumcss/tw/collect", () => {
	expect<ObservedPublicValueExports["./tw/collect"]>().type.toBe<
		ExpectedPublicValueExports["./tw/collect"]
	>();
});

test("public value exports: yumcss/vite", () => {
	expect<ObservedPublicValueExports["./vite"]>().type.toBe<ExpectedPublicValueExports["./vite"]>();
});

test("public value exports: yumcss/vite/runtime-pruner", () => {
	expect<ObservedPublicValueExports["./vite/runtime-pruner"]>().type.toBe<
		ExpectedPublicValueExports["./vite/runtime-pruner"]
	>();
});

test("public value exports: yumcss/vite/css-extract", () => {
	expect<ObservedPublicValueExports["./vite/css-extract"]>().type.toBe<
		ExpectedPublicValueExports["./vite/css-extract"]
	>();
});

test("public value exports: yumcss/vite/css-inline-analysis", () => {
	expect<ObservedPublicValueExports["./vite/css-inline-analysis"]>().type.toBe<
		ExpectedPublicValueExports["./vite/css-inline-analysis"]
	>();
});

test("public value exports: yumcss/vite/lib-artifact", () => {
	expect<ObservedPublicValueExports["./vite/lib-artifact"]>().type.toBe<
		ExpectedPublicValueExports["./vite/lib-artifact"]
	>();
});

test("public value exports: yumcss/vite/cross-module-consts", () => {
	expect<ObservedPublicValueExports["./vite/cross-module-consts"]>().type.toBe<
		ExpectedPublicValueExports["./vite/cross-module-consts"]
	>();
});

test("public value exports: yumcss/vite/cx-inline", () => {
	expect<ObservedPublicValueExports["./vite/cx-inline"]>().type.toBe<
		ExpectedPublicValueExports["./vite/cx-inline"]
	>();
});

test("public value exports: yumcss/vite/inline", () => {
	expect<ObservedPublicValueExports["./vite/inline"]>().type.toBe<
		ExpectedPublicValueExports["./vite/inline"]
	>();
});

test("public value exports: yumcss/vite/stack-fold", () => {
	expect<ObservedPublicValueExports["./vite/stack-fold"]>().type.toBe<
		ExpectedPublicValueExports["./vite/stack-fold"]
	>();
});

test("public value exports: yumcss/unplugin", () => {
	expect<ObservedPublicValueExports["./unplugin"]>().type.toBe<
		ExpectedPublicValueExports["./unplugin"]
	>();
});

test("public value exports: yumcss/css/create-stylesheet", () => {
	expect<ObservedPublicValueExports["./css/create-stylesheet"]>().type.toBe<
		ExpectedPublicValueExports["./css/create-stylesheet"]
	>();
});

test("public value exports: yumcss/design/resolve", () => {
	expect<ObservedPublicValueExports["./design/resolve"]>().type.toBe<
		ExpectedPublicValueExports["./design/resolve"]
	>();
});

test("public value exports: yumcss/lib/utils", () => {
	expect<ObservedPublicValueExports["./lib/utils"]>().type.toBe<
		ExpectedPublicValueExports["./lib/utils"]
	>();
});

test("public value exports: yumcss/tw/compile", () => {
	expect<ObservedPublicValueExports["./tw/compile"]>().type.toBe<
		ExpectedPublicValueExports["./tw/compile"]
	>();
});

test("public value exports: yumcss/tw/literal", () => {
	expect<ObservedPublicValueExports["./tw/literal"]>().type.toBe<
		ExpectedPublicValueExports["./tw/literal"]
	>();
});

test("public value exports: yumcss/react-native", () => {
	expect<ObservedPublicValueExports["./react-native"]>().type.toBe<
		ExpectedPublicValueExports["./react-native"]
	>();
});

test("public value exports: yumcss/types/typings", () => {
	expect<ObservedPublicValueExports["./types/typings"]>().type.toBe<
		ExpectedPublicValueExports["./types/typings"]
	>();
});

test("public value exports: yumcss/opentui", () => {
	expect<ObservedPublicValueExports["./opentui"]>().type.toBe<
		ExpectedPublicValueExports["./opentui"]
	>();
});

test("public value exports: yumcss/react-strict-dom", () => {
	expect<ObservedPublicValueExports["./react-strict-dom"]>().type.toBe<
		ExpectedPublicValueExports["./react-strict-dom"]
	>();
});

test("public value exports: yumcss/backends", () => {
	expect<ObservedPublicValueExports["./backends"]>().type.toBe<
		ExpectedPublicValueExports["./backends"]
	>();
});

test("public value exports: yumcss/source", () => {
	expect<ObservedPublicValueExports["./source"]>().type.toBe<
		ExpectedPublicValueExports["./source"]
	>();
});

test("public value exports: yumcss/source/workspace", () => {
	expect<ObservedPublicValueExports["./source/workspace"]>().type.toBe<
		ExpectedPublicValueExports["./source/workspace"]
	>();
});

test("public value exports: yumcss/_runtime/css-base", () => {
	expect<ObservedPublicValueExports["./_runtime/css-base"]>().type.toBe<
		ExpectedPublicValueExports["./_runtime/css-base"]
	>();
});

test("public value exports: yumcss/_runtime/css-codegen", () => {
	expect<ObservedPublicValueExports["./_runtime/css-codegen"]>().type.toBe<
		ExpectedPublicValueExports["./_runtime/css-codegen"]
	>();
});

test("public value exports: yumcss/_runtime/css-preset", () => {
	expect<ObservedPublicValueExports["./_runtime/css-preset"]>().type.toBe<
		ExpectedPublicValueExports["./_runtime/css-preset"]
	>();
});

test("public value exports: yumcss/_runtime/css-design", () => {
	expect<ObservedPublicValueExports["./_runtime/css-design"]>().type.toBe<
		ExpectedPublicValueExports["./_runtime/css-design"]
	>();
});

test("public value exports: yumcss/_runtime/css-class", () => {
	expect<ObservedPublicValueExports["./_runtime/css-class"]>().type.toBe<
		ExpectedPublicValueExports["./_runtime/css-class"]
	>();
});

test("public value exports: yumcss/_runtime/css-vars", () => {
	expect<ObservedPublicValueExports["./_runtime/css-vars"]>().type.toBe<
		ExpectedPublicValueExports["./_runtime/css-vars"]
	>();
});

test("public value exports: yumcss/_runtime/css-raw", () => {
	expect<ObservedPublicValueExports["./_runtime/css-raw"]>().type.toBe<
		ExpectedPublicValueExports["./_runtime/css-raw"]
	>();
});

test("public value exports: yumcss/_runtime/css-props", () => {
	expect<ObservedPublicValueExports["./_runtime/css-props"]>().type.toBe<
		ExpectedPublicValueExports["./_runtime/css-props"]
	>();
});

test("public value exports: yumcss/_runtime/css-group", () => {
	expect<ObservedPublicValueExports["./_runtime/css-group"]>().type.toBe<
		ExpectedPublicValueExports["./_runtime/css-group"]
	>();
});

test("public value exports: yumcss/_runtime/css-input", () => {
	expect<ObservedPublicValueExports["./_runtime/css-input"]>().type.toBe<
		ExpectedPublicValueExports["./_runtime/css-input"]
	>();
});

test("public value exports: yumcss/_runtime/css-keyframes", () => {
	expect<ObservedPublicValueExports["./_runtime/css-keyframes"]>().type.toBe<
		ExpectedPublicValueExports["./_runtime/css-keyframes"]
	>();
});
