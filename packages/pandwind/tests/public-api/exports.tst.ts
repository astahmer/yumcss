import { expect, test } from "tstyche";

type PublicTypedExports = {
	".": keyof import("pandwind");
	"./css": keyof import("pandwind/css");
	"./css/generated": keyof import("pandwind/css/generated");
	"./css/named": keyof import("pandwind/css/named");
	"./unsafe/css": keyof import("pandwind/unsafe/css");
	"./css/runtime": keyof import("pandwind/css/runtime");
	"./css/selector-scan": keyof import("pandwind/css/selector-scan");
	"./css/stylex": keyof import("pandwind/css/stylex");
	"./css/panda": keyof import("pandwind/css/panda");
	"./css/unocss": keyof import("pandwind/css/unocss");
	"./cx": keyof import("pandwind/cx");
	"./preset": keyof import("pandwind/preset");
	"./preset/csstype": keyof import("pandwind/preset/csstype");
	"./preset/default": keyof import("pandwind/preset/default");
	"./preset/tailwindcss": keyof import("pandwind/preset/tailwindcss");
	"./preset/chakra": keyof import("pandwind/preset/chakra");
	"./preset/shadcn": keyof import("pandwind/preset/shadcn");
	"./preset/panda": keyof import("pandwind/preset/panda");
	"./stack": keyof import("pandwind/stack");
	"./stack/react": keyof import("pandwind/stack/react");
	"./stack/solid": keyof import("pandwind/stack/solid");
	"./stack/vue": keyof import("pandwind/stack/vue");
	"./stack/preact": keyof import("pandwind/stack/preact");
	"./design": keyof import("pandwind/design");
	"./host": keyof import("pandwind/host");
	"./tw": keyof import("pandwind/tw");
	"./tw/collect": keyof import("pandwind/tw/collect");
	"./vite": keyof import("pandwind/vite");
	"./vite/runtime-pruner": keyof import("pandwind/vite/runtime-pruner");
	"./vite/css-extract": keyof import("pandwind/vite/css-extract");
	"./vite/css-inline-analysis": keyof import("pandwind/vite/css-inline-analysis");
	"./vite/lib-artifact": keyof import("pandwind/vite/lib-artifact");
	"./vite/cross-module-consts": keyof import("pandwind/vite/cross-module-consts");
	"./vite/cx-inline": keyof import("pandwind/vite/cx-inline");
	"./vite/inline": keyof import("pandwind/vite/inline");
	"./vite/stack-fold": keyof import("pandwind/vite/stack-fold");
	"./unplugin": keyof import("pandwind/unplugin");
	"./css/create-stylesheet": keyof import("pandwind/css/create-stylesheet");
	"./design/resolve": keyof import("pandwind/design/resolve");
	"./lib/utils": keyof import("pandwind/lib/utils");
	"./tw/compile": keyof import("pandwind/tw/compile");
	"./tw/literal": keyof import("pandwind/tw/literal");
	"./react-native": keyof import("pandwind/react-native");
	"./types/typings": keyof import("pandwind/types/typings");
	"./opentui": keyof import("pandwind/opentui");
	"./react-strict-dom": keyof import("pandwind/react-strict-dom");
	"./backends": keyof import("pandwind/backends");
	"./source": keyof import("pandwind/source");
	"./source/workspace": keyof import("pandwind/source/workspace");
	"./_runtime/css-base": keyof import("pandwind/_runtime/css-base");
	"./_runtime/css-codegen": keyof import("pandwind/_runtime/css-codegen");
	"./_runtime/css-preset": keyof import("pandwind/_runtime/css-preset");
	"./_runtime/css-design": keyof import("pandwind/_runtime/css-design");
	"./_runtime/css-class": keyof import("pandwind/_runtime/css-class");
	"./_runtime/css-vars": keyof import("pandwind/_runtime/css-vars");
	"./_runtime/css-raw": keyof import("pandwind/_runtime/css-raw");
	"./_runtime/css-props": keyof import("pandwind/_runtime/css-props");
	"./_runtime/css-group": keyof import("pandwind/_runtime/css-group");
	"./_runtime/css-input": keyof import("pandwind/_runtime/css-input");
	"./_runtime/css-keyframes": keyof import("pandwind/_runtime/css-keyframes");
};

type ExpectedPublicTypedExports = {
	".":
		| "CxFn"
		| "CxInput"
		| "CxOptions"
		| "TwAdapterOptions"
		| "TwComposeMeta"
		| "TwConflictsMeta"
		| "TwDirectionalConflictsMeta"
		| "TwNestedStyles"
		| "TwOptions"
		| "TwValue"
		| "TwVariantsMeta"
		| "UtilityBridge"
		| "VarAtom"
		| "VarsOutput"
		| "createCx"
		| "createTw"
		| "createTwAdapter"
		| "resolveVar"
		| "simplifyCalc"
		| "themeVariables"
		| "tw";
	"./css":
		| "AtomicStyleProps"
		| "ClassNameStrategy"
		| "CreateCssOptions"
		| "CssCascade"
		| "CssCascadeLayerOptions"
		| "CssCascadeMode"
		| "CssFn"
		| "FirstThatWorksValue"
		| "createCss"
		| "firstThatWorks";
	"./css/generated": "createGeneratedCss";
	"./css/named": "createNamedAtomsStrategy";
	"./unsafe/css": "CreateCssOptions" | "CssFn" | "createUnsafeCss";
	"./css/runtime":
		| "RuntimeCssFn"
		| "RuntimeCssOptions"
		| "RuntimeDeclaration"
		| "RuntimeDocument"
		| "RuntimeOrderingPolicy"
		| "RuntimeRule"
		| "RuntimeRuleCanonicalizer"
		| "RuntimeRuleSerializer"
		| "RuntimeSemanticRule"
		| "RuntimeSemanticRuleKind"
		| "RuntimeSemanticRuleKindTag"
		| "RuntimeSheet"
		| "RuntimeSheetOptions"
		| "RuntimeSheetSnapshot"
		| "RuntimeStyleElementSink"
		| "createRuntimeCss"
		| "createRuntimeDesignCss"
		| "createRuntimeSheet";
	"./css/selector-scan": "SelectorClassMatch" | "selectorClassMatches" | "splitSelectorList";
	"./css/stylex": "StyleXAdapterOptions" | "createStyleXAdapter";
	"./css/panda": "PandaAdapterOptions" | "createPandaAdapter";
	"./css/unocss": "UnoCssAdapterOptions" | "createUnoCssAdapter";
	"./cx": "CxFn" | "CxInput" | "CxOptions" | "VarAtom" | "VarsOutput" | "createCx";
	"./preset":
		| "AnyConditions"
		| "AnyCssConfig"
		| "AnyPresetProperties"
		| "AnySemanticTokens"
		| "AnySimpleTokens"
		| "AnyTokens"
		| "ColorPaletteDefinitions"
		| "ColorPaletteSource"
		| "CssConfigReturn"
		| "CssPreset"
		| "CssVariableDescriptor"
		| "CssVariableValue"
		| "CssVariables"
		| "CssWideValue"
		| "CsstypePreset"
		| "CsstypeProperties"
		| "DefaultPreset"
		| "DefinePresetOptions"
		| "DynamicStyleObject"
		| "DynamicStyleValue"
		| "PandwindCssValue"
		| "PandwindProperties"
		| "PresetConditions"
		| "PresetWeb"
		| "PresetWebFontFace"
		| "PresetWebKeyframeBody"
		| "PresetWebStyleObject"
		| "PresetWebValue"
		| "SemanticToken"
		| "SimpleToken"
		| "StyleObject"
		| "StyleValue"
		| "Token"
		| "TokenCatalog"
		| "TokenDeclaration"
		| "TokenGroup"
		| "TokenGroupKey"
		| "TokenReference"
		| "TokenVariableNames"
		| "TokenVariables"
		| "Tokens"
		| "TypedDynamicStyleObject"
		| "TypedRawStyleObject"
		| "TypedStyleObject"
		| "csstypePreset"
		| "csstypeProperties"
		| "defaultPreset"
		| "define"
		| "presetConditions"
		| "presetProperties"
		| "tokens";
	"./preset/csstype": "CsstypePreset" | "CsstypeProperties" | "csstypePreset" | "csstypeProperties";
	"./preset/default": "DefaultPreset" | "defaultPreset";
	"./preset/tailwindcss":
		| "TailwindConditions"
		| "TailwindPreset"
		| "TailwindProperties"
		| "TailwindTokens"
		| "tailwindConditions"
		| "tailwindPreset"
		| "tailwindProperties"
		| "tailwindTokens";
	"./preset/chakra":
		| "ChakraConditions"
		| "ChakraCssConfig"
		| "ChakraExtraProperty"
		| "ChakraPreset"
		| "ChakraProperties"
		| "ChakraTokens"
		| "chakraConditions"
		| "chakraPreset"
		| "chakraProperties"
		| "chakraTokens";
	"./preset/shadcn":
		| "ShadcnBaseColor"
		| "ShadcnBaseColorLightVariables"
		| "ShadcnColorRole"
		| "ShadcnColorToken"
		| "ShadcnColorTokens"
		| "ShadcnConditions"
		| "ShadcnConfig"
		| "ShadcnDeclarations"
		| "ShadcnFontHeadingName"
		| "ShadcnFontName"
		| "ShadcnMenuAccent"
		| "ShadcnMenuColor"
		| "ShadcnPreset"
		| "ShadcnPresetOptions"
		| "ShadcnProperties"
		| "ShadcnRadiusName"
		| "ShadcnStyleName"
		| "ShadcnThemeName"
		| "ShadcnTokens"
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
		| "shadcnTokens";
	"./preset/panda":
		| "PandaConditions"
		| "PandaCssConfig"
		| "PandaExtraProperty"
		| "PandaPreset"
		| "PandaProperties"
		| "PandaTokens"
		| "pandaConditions"
		| "pandaPreset"
		| "pandaProperties"
		| "pandaTokens";
	"./stack":
		| "StackAlign"
		| "StackClassCompiler"
		| "StackClassName"
		| "StackCssValue"
		| "StackDirection"
		| "StackJustify"
		| "StackProps"
		| "StackResponsiveValue"
		| "StackStyle"
		| "createStackClassName"
		| "stackClasses"
		| "stackStyle";
	"./stack/react": "Stack" | "StackComponentProps" | "StackProps" | "createStack";
	"./stack/solid": "Stack" | "StackComponentProps" | "createStack";
	"./stack/vue": "Stack" | "StackComponentProps" | "createStack";
	"./stack/preact": "Stack" | "StackComponentProps" | "createStack";
	"./design": "DesignDynamicStyleObject" | "DesignPreset" | "DesignStyleObject" | "createDesignCss";
	"./host":
		| "BUILTIN_HOST_STYLE_PLUGINS"
		| "BuiltinHostFramework"
		| "HOST_STYLE_PLUGIN_SCHEMA"
		| "HOST_STYLE_REGISTRY"
		| "HostFramework"
		| "HostStyleAdapter"
		| "HostStylePlugin"
		| "HostStyleRegistry"
		| "createHostStyleRegistry"
		| "getHostStyleAdapter";
	"./tw":
		| "TwAdapterOptions"
		| "TwComposeMeta"
		| "TwConflictsMeta"
		| "TwDirectionalConflictsMeta"
		| "TwNestedStyles"
		| "TwOptions"
		| "TwValue"
		| "TwVariantsMeta"
		| "UtilityBridge"
		| "createTw"
		| "createTwAdapter"
		| "resolveVar"
		| "simplifyCalc"
		| "themeVariables"
		| "tw";
	"./tw/collect":
		| "TwClassCollector"
		| "TwCollectResult"
		| "TwScanOptions"
		| "TwScanResult"
		| "collectTwClasses"
		| "createTwClassCollector"
		| "runTwScan";
	"./vite":
		| "InlineTwPluginCore"
		| "PANDWIND_LIB_COMPILER"
		| "PANDWIND_LIB_GENERATOR"
		| "PANDWIND_LIB_SCHEMA"
		| "PandwindCssViteOptions"
		| "PandwindEngineContext"
		| "PandwindEngineContextOptions"
		| "PandwindLibArtifact"
		| "PandwindLibArtifactInput"
		| "PandwindLibCompatibility"
		| "PandwindLibCompatibilityCheck"
		| "PandwindLibCompatibilityOptions"
		| "PandwindLibRule"
		| "PandwindLibSource"
		| "PandwindLibValidation"
		| "PandwindViteOptions"
		| "Resolver"
		| "StackFoldOptions"
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
		| "validatePandwindLibArtifact";
	"./vite/runtime-pruner":
		| "RuntimePruningExplanation"
		| "RuntimePruningExplanationOptions"
		| "RuntimePruningOptions"
		| "RuntimePruningStatus"
		| "RuntimePruningTransform"
		| "createRuntimePruningTransform"
		| "explainRuntimePruning";
	"./vite/css-extract":
		| "AuthoredCssImport"
		| "CssCallSite"
		| "CssDiagnostic"
		| "CssDiagnosticKind"
		| "CssExtractionServiceOptions"
		| "CssFileExtraction"
		| "CssPreset"
		| "CssSourceInspection"
		| "CssSourceProvenance"
		| "CssSourceScanner"
		| "ExtractedCssStyle"
		| "InlineCssResult"
		| "createCssExtractionService"
		| "createCssSourceScanner";
	"./vite/css-inline-analysis":
		| "CSS_INLINE_UNKNOWN"
		| "CssInlineAnalysis"
		| "CssInlineAnalysisOptions"
		| "CssInlineArgumentAnalysis"
		| "CssInlineEntry"
		| "CssInlineResidual"
		| "CssInlineResidualCode"
		| "InlineAstNode"
		| "LiteralCallEvaluator"
		| "LiteralConstantScope"
		| "OxcNode"
		| "analyzeCssInlineArguments"
		| "canonicalStyleKey"
		| "createCssLiteralScopeResolver"
		| "createFirstThatWorksEvaluator"
		| "evalLiteral"
		| "findCssFallbackValueNames"
		| "isLiteralKeyframeBody";
	"./vite/lib-artifact":
		| "PANDWIND_LIB_COMPILER"
		| "PANDWIND_LIB_GENERATOR"
		| "PANDWIND_LIB_SCHEMA"
		| "PandwindLibArtifact"
		| "PandwindLibArtifactInput"
		| "PandwindLibCompatibility"
		| "PandwindLibCompatibilityCheck"
		| "PandwindLibCompatibilityOptions"
		| "PandwindLibRule"
		| "PandwindLibSource"
		| "PandwindLibValidation"
		| "checkPandwindLibCompatibility"
		| "createPandwindLibArtifact"
		| "createPandwindLibCompatibility"
		| "hashPandwindLibSource"
		| "validatePandwindLibArtifact";
	"./vite/cross-module-consts":
		| "CrossModuleResolver"
		| "CrossModuleResolverOptions"
		| "ImportBinding"
		| "ModuleExportAnalysis"
		| "analyzeModuleExports"
		| "bindingIsShadowedOrWritten"
		| "collectImportBindings"
		| "createCrossModuleConstResolver";
	"./vite/cx-inline":
		| "ConstantScope"
		| "CxCompilerOptions"
		| "CxCompilerPorts"
		| "CxFoldContext"
		| "CxImportInfo"
		| "InlineCxCallsOptions"
		| "InlineResult"
		| "KnownConstant"
		| "StaticEval"
		| "collectModuleConstants"
		| "defaultCxCompilerPorts"
		| "evalStaticCx"
		| "findCxImports"
		| "inlineCxCalls";
	"./vite/inline":
		| "InlineResult"
		| "OnUnresolved"
		| "OnUnresolvedTag"
		| "TwConfig"
		| "UnresolvedOptions"
		| "extractTwConfig"
		| "extractTwConfigFromSources"
		| "inlineTwCalls";
	"./vite/stack-fold": "StackFoldOptions" | "foldStackElements" | "stackFoldVite";
	"./unplugin":
		| "PandwindUnpluginCssOptions"
		| "PandwindUnpluginOptions"
		| "pandwindRollup"
		| "pandwindRollupCss"
		| "pandwindUnplugin"
		| "pandwindUnpluginCss"
		| "pandwindWebpack"
		| "pandwindWebpackCss";
	"./css/create-stylesheet":
		| "PreparedStyle"
		| "StylesheetPolicies"
		| "createStylesheet"
		| "decodeAtomicPath"
		| "getPropertyPriority";
	"./design/resolve":
		| "DefaultDesignModuleRegistry"
		| "DesignModuleAdapter"
		| "DesignModuleContext"
		| "DesignModuleRegistry"
		| "DesignStyleResolver"
		| "TokenLookup"
		| "createDesignModuleRegistry"
		| "resolveDesignStyle";
	"./lib/utils":
		| "FlatStyles"
		| "assign"
		| "concatPair"
		| "cssVar"
		| "dashCase"
		| "flatten"
		| "flattenStyle"
		| "isSafePathPart"
		| "joinParts"
		| "pairs"
		| "splitPair";
	"./tw/compile":
		| "TwComposeMeta"
		| "TwConflictsMeta"
		| "TwDirectionalConflictsMeta"
		| "TwNestedStyles"
		| "TwValue"
		| "TwValueTokensMeta"
		| "TwVariantsMeta"
		| "UTILITY_SUBKEYS"
		| "compileStyles";
	"./tw/literal":
		| "ImportKindTag"
		| "LiteralCallEvaluator"
		| "LiteralConstantScope"
		| "LiteralValueSet"
		| "NodeKind"
		| "OxcNode"
		| "OxcParentVisitor"
		| "PropertyKindTag"
		| "VariableDeclarationKindTag"
		| "evalLiteral"
		| "evalLiteralValues"
		| "isTwCall"
		| "literalValueSetSize"
		| "walk"
		| "walkWithParent";
	"./react-native":
		| "ObjectBackend"
		| "ObjectCssFn"
		| "ObjectCxFn"
		| "RnCssFn"
		| "RnStyle"
		| "TargetStyle"
		| "createCx"
		| "createDesignCss"
		| "createObjectCss"
		| "createObjectCx"
		| "createRnBackend";
	"./types/typings":
		| "AnyConditions"
		| "AnyCssConfig"
		| "AnyPresetProperties"
		| "AnySemanticTokens"
		| "AnySimpleTokens"
		| "AnyTokens"
		| "ColorPaletteDefinitions"
		| "ColorPaletteSource"
		| "CssConfigReturn"
		| "CssPreset"
		| "CssVariableDescriptor"
		| "CssVariableValue"
		| "CssVariables"
		| "CssWideValue"
		| "DefinePresetOptions"
		| "DynamicStyleObject"
		| "DynamicStyleValue"
		| "PresetWeb"
		| "PresetWebFontFace"
		| "PresetWebKeyframeBody"
		| "PresetWebStyleObject"
		| "PresetWebValue"
		| "SemanticToken"
		| "SimpleToken"
		| "StyleObject"
		| "StyleValue"
		| "Token"
		| "TokenCatalog"
		| "TokenDeclaration"
		| "TokenGroup"
		| "TokenGroupKey"
		| "TokenReference"
		| "TokenVariableNames"
		| "TokenVariables"
		| "TypedDynamicStyleObject"
		| "TypedRawStyleObject"
		| "TypedStyleObject";
	"./opentui":
		| "ObjectBackend"
		| "ObjectCssFn"
		| "ObjectCxFn"
		| "OpentuiCssFn"
		| "OpentuiStyle"
		| "TargetStyle"
		| "createCx"
		| "createDesignCss"
		| "createObjectCss"
		| "createObjectCx"
		| "createOpentuiBackend";
	"./react-strict-dom":
		| "ReactStrictDomBackend"
		| "ReactStrictDomBackendOptions"
		| "ReactStrictDomCompiledStyle"
		| "ReactStrictDomCssFn"
		| "ReactStrictDomCxFn"
		| "ReactStrictDomDesignCssFn"
		| "ReactStrictDomNativeBackendOptions"
		| "ReactStrictDomNativeStyle"
		| "ReactStrictDomPlatform"
		| "ReactStrictDomPlatformType"
		| "ReactStrictDomStyle"
		| "ReactStrictDomStyleFor"
		| "ReactStrictDomWebBackendOptions"
		| "createCss"
		| "createCx"
		| "createDesignCss"
		| "createReactStrictDomBackend";
	"./backends":
		| "BackendArtifactKind"
		| "BackendCapabilityContract"
		| "BackendCapabilityLevel"
		| "BackendDeclarationIssue"
		| "BackendFeature"
		| "BackendLossiness"
		| "BuiltinBackendId"
		| "CssBackendOptions"
		| "FlatStyleIR"
		| "ObjectBackend"
		| "ObjectBackendOptions"
		| "ObjectCssFn"
		| "ObjectCxFn"
		| "OpentuiBackendOptions"
		| "REACT_STRICT_DOM_BACKEND"
		| "ReactStrictDomBackend"
		| "ReactStrictDomBackendOptions"
		| "ReactStrictDomCompiledStyle"
		| "ReactStrictDomNativeBackendOptions"
		| "ReactStrictDomPlatform"
		| "ReactStrictDomPlatformType"
		| "ReactStrictDomStyle"
		| "ReactStrictDomWebBackendOptions"
		| "RnBackendOptions"
		| "STYLE_BACKENDS"
		| "STYLE_BACKEND_CONTRACT_SCHEMA"
		| "STYLE_BACKEND_FACTORIES"
		| "STYLE_BACKEND_SCHEMA"
		| "StyleBackend"
		| "StyleBackendContractFailure"
		| "StyleBackendContractFixture"
		| "StyleBackendContractPhase"
		| "StyleBackendContractResult"
		| "StyleBackendContractSuite"
		| "StyleBackendFactory"
		| "StyleBackendId"
		| "StyleBackendRegistry"
		| "TargetStyle"
		| "createCssBackend"
		| "createDesignObjectCss"
		| "createObjectBackend"
		| "createObjectCss"
		| "createObjectCx"
		| "createOpentuiBackend"
		| "createReactStrictDomBackend"
		| "createRnBackend"
		| "createStyleBackendContractSuite"
		| "createStyleBackendRegistry";
	"./source":
		| "BUILTIN_SOURCE_SCANNER_PLUGIN"
		| "SOURCE_LANGUAGE_ADAPTERS"
		| "SOURCE_PROJECT_BINDINGS_SCHEMA"
		| "SOURCE_SCANNER"
		| "SOURCE_SCANNER_CONTRACT_SCHEMA"
		| "SOURCE_SCANNER_PLUGIN_SCHEMA"
		| "SOURCE_SCANNER_SCHEMA"
		| "SOURCE_SCANNER_SERVICE"
		| "SourceBinding"
		| "SourceBindingIndex"
		| "SourceBindingKind"
		| "SourceBindings"
		| "SourceCallSite"
		| "SourceCallSiteKind"
		| "SourceDocument"
		| "SourceExportAll"
		| "SourceFramework"
		| "SourceHostUse"
		| "SourceHostUseKind"
		| "SourceLanguage"
		| "SourceLanguageAdapter"
		| "SourceLanguageAdapterId"
		| "SourceProjectBindingIndex"
		| "SourceProjectBindingLoader"
		| "SourceRange"
		| "SourceReexport"
		| "SourceRuntimeBoundary"
		| "SourceScanDiagnostic"
		| "SourceScanResult"
		| "SourceScannerContractFailure"
		| "SourceScannerContractFixture"
		| "SourceScannerContractResult"
		| "SourceScannerContractSuite"
		| "SourceScannerPlugin"
		| "SourceScannerRegistry"
		| "SourceScannerService"
		| "computeExcludedRanges"
		| "createSourceProjectBindingIndex"
		| "createSourceScannerContractSuite"
		| "createSourceScannerRegistry"
		| "parseSourceProgram";
	"./source/workspace":
		| "SOURCE_WORKSPACE_SCHEMA"
		| "SourceWorkspace"
		| "SourceWorkspaceFile"
		| "SourceWorkspaceFileSystem"
		| "SourceWorkspaceGlobOptions"
		| "SourceWorkspaceOptions"
		| "SourceWorkspaceQuery"
		| "createSourceWorkspace";
	"./_runtime/css-base":
		| "AnyInput"
		| "CompiledStyles"
		| "CreateCssOptions"
		| "CssStyle"
		| "DYNAMIC"
		| "DynamicFn"
		| "DynamicReturn"
		| "DynamicStyles"
		| "RuntimeCssAttachment"
		| "RuntimeCssContext"
		| "RuntimeCssFunction"
		| "TypedPreset"
		| "TypedRuntimeCssFunction"
		| "createCssRuntime";
	"./_runtime/css-codegen":
		| "CSS_RUNTIME_METHODS"
		| "CssRuntimeFactory"
		| "CssRuntimeFactoryTag"
		| "CssRuntimeMethod"
		| "CssRuntimeMethodTag"
		| "RenderCssRuntimeModuleOptions"
		| "normalizeCssRuntimeMethods"
		| "renderCssRuntimeModule";
	"./_runtime/css-preset": "TypedPreset" | "createPresetCssRuntime";
	"./_runtime/css-design": "createDesignCssRuntime";
	"./_runtime/css-class": "attachClass";
	"./_runtime/css-vars": "attachVars";
	"./_runtime/css-raw": "attachRaw";
	"./_runtime/css-props": "attachProps";
	"./_runtime/css-group": "attachGroup";
	"./_runtime/css-input": "attachInput";
	"./_runtime/css-keyframes": "attachKeyframes";
};

test("every declaration-bearing package export stays in the type coverage ledger", () => {
	expect<PublicTypedExports>().type.toBe<ExpectedPublicTypedExports>();
});
