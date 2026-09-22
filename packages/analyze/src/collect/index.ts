/**
 * Collection engine (plans/023 unification) — the shared layer between the
 * analyze CLI and the Inspector server.
 *
 * - payload assembly: {@link gather}
 * - generated-artifact parsers: parseThemeVars / parseUtilityUnions /
 *   parseBridgeStats / flattenTokenGroups
 * - usage analytics + contrast: analyzeStyleUsage / computeContrastWarnings /
 *   buildPruneChangeset
 * - transitive css @import crawling: crawlCssImports
 * - re-exports of the analyze core primitives the collectors compose
 *   (runCli, createCssBudgetService, collectFiles, loadTwConfig)
 */
export { gather } from "./gather.ts";
export {
	analyzeStyleUsage,
	buildPruneChangeset,
	computeContrastWarnings,
	evaluateContrastPair,
} from "./analytics.ts";
export {
	flattenTokenGroups,
	groupThemeVars,
	parseBridgeStats,
	parseThemeVars,
	parseThemeScopes,
	parseUtilityUnions,
	resolveChain,
	splitTokenValue,
	type ThemeVarCategory,
} from "./parsers.ts";
export { crawlCssImports } from "./theme-crawl.ts";
export {
	collectAuthoredCssImports,
	collectCssDiagnostics,
	collectCssReport,
	collectCssProvenance,
	formatAuthoredCssImports,
	formatCssDiagnostics,
	type AnalyzeSourceFile,
} from "../css-diagnostics.ts";
export type {
	AuthoredCssImport,
	CollectPayload,
	ConditionUsage,
	ContrastEvaluation,
	ContrastStatus,
	ContrastWarning,
	CssCallSite,
	CssDiagnostic,
	CssDiagnosticKind,
	CoverageFile,
	MissingSite,
	SheetShape,
	ShapeCategory,
	SpecificityBucket,
	StyleUsageReport,
	StyleValueCoverage,
	StyleValueCoverageSummary,
	TokenGovernanceReport,
	ThemeVar,
	TokenSection,
	UsageCount,
	UtilityUnion,
} from "./types.ts";

export { collectFiles, loadTwConfig } from "../analyze.ts";
export { runCli } from "../cli.ts";
export {
	createCssBudgetService,
	type CssBudgetPort,
	type CssBudgetDependencies,
} from "../analysis-service.ts";
