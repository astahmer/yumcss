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
	type TwManifestCommand,
	type TwPruneCommand,
	type TwScanCommand,
	type TwVerifyCommand,
} from "./cli.ts";
export {
	checkGeneratedArtifactManifest,
	PANDWIND_GENERATED_BUDGET_SCHEMA,
	type GeneratedArtifactBudget,
	type GeneratedArtifactBudgetFile,
	type GeneratedArtifactCheck,
	type GeneratedArtifactCheckReport,
} from "./artifact-check.ts";
export { BRIDGE_PROPS, generateUtilityBridge, type UtilityBridge } from "./bridge.ts";
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
	buildGeneratedArtifactManifest,
	hashGeneratedContent,
	PANDWIND_GENERATED_MANIFEST_SCHEMA,
	GeneratedArtifactOwnershipTag,
	type GeneratedArtifactInput,
	type GeneratedArtifactEntry,
	type GeneratedArtifactManifestOptions,
	type PandwindGeneratedManifest,
} from "./artifact-manifest.ts";
export {
	buildPandwindInteropArtifact,
	parsePandwindInteropArtifact,
	PANDWIND_INTEROP_SCHEMA,
	type BuildPandwindInteropArtifactOptions,
	type PandwindInteropArtifact,
	type PandwindInteropTokenSnapshot,
	type PandwindInteropUtility,
} from "./interop-artifact.ts";
export {
	loadTokenDocument,
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
