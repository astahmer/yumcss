/**
 * Tailwind project tooling.
 *
 * Runtime Tailwind APIs stay in `pandwind/tw`. This lane owns loading a real
 * Tailwind design system, generating the typed artifacts and inverted bridge,
 * writing interop metadata, scanning dynamic candidates, and pruning themes.
 */
export {
	TwCommand,
	createTwCli,
	parseTwCommand,
	type TwCli,
	type TwCliHandlers,
	type TwCommandInvocation,
	type TwCommandName,
	type TwGenerateCommand,
	type TwPruneCommand,
	type TwScanCommand,
} from "./cli.ts";
export {
	BRIDGE_PROPS,
	generateUtilityBridge,
	type UtilityBridge,
} from "./bridge.ts";
export {
	createDesignSystemCodegen,
	generateDesignSystem,
	canonicalProps,
	type DesignSystemCodegen,
	type DesignSystemCodegenDependencies,
	type GeneratedDesignSystemSource,
	type GenerateDesignSystemOptions,
} from "./generate-types.ts";
export {
	buildThemeBlock,
	buildThemeScopes,
	buildComponentScopes,
	createConditionResolver,
	normalizeThemeValue,
	splitTokens,
	themeNamespaceFor,
	themeTokenName,
	type ComponentScopeMap,
	type ConditionalVar,
	type ResolvedConditionParts,
	type ThemeConditions,
	type ThemeScopeMap,
	type ThemeTokenGroups,
	type ThemeVar,
} from "./generate-theme.ts";
export {
	buildPandwindInteropArtifact,
	PANDWIND_INTEROP_SCHEMA,
	type BuildPandwindInteropArtifactOptions,
	type PandwindInteropArtifact,
	type PandwindInteropUtility,
} from "./interop-artifact.ts";
export {
	loadThemeBlock,
	resolveComponents,
	resolvePresetConditions,
	resolveThemes,
	resolveTokenGroups,
} from "./codegen-theme-input.ts";
export {
	collectTwClasses,
	createTwClassCollector,
	runTwScan,
	type TwClassCollector,
	type TwCollectResult,
	type TwScanOptions,
	type TwScanResult,
} from "pandwind/tw/collect";
export {
	buildTokenGraph,
	type TokenGraph,
	type TokenGraphEdge,
	type TokenGraphInput,
	type TokenGraphNode,
	type TokenTier,
} from "./token-graph.ts";
export {
	filterBridgeByUsedVars,
	pruneThemeBlock,
	runTwPrune,
	themeBlockBody,
	usedBridgeVars,
	type PruneOptions,
	type TwPruneOptions,
	type TwPruneResult,
} from "./prune-theme.ts";
