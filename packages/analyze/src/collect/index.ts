/**
 * Collection engine (plans/023 unification) — the shared layer between the
 * analyze CLI and apps/inspector's studio server. One import point:
 *
 * - payload assembly: {@link gather}
 * - generated-artifact parsers: parseThemeVars / parseUtilityUnions /
 *   parseBridgeStats / flattenTokenGroups
 * - usage analytics + contrast: analyzeStyleUsage / computeContrastWarnings /
 *   buildPruneChangeset
 * - transitive css @import crawling: crawlCssImports
 * - re-exports of the analyze core primitives the collectors compose
 *   (runCli, cssBudget, classRules, sheetShape, collectFiles, loadTwConfig)
 */
export { gather } from "./gather.ts";
export { analyzeStyleUsage, buildPruneChangeset, computeContrastWarnings } from "./analytics.ts";
export {
	flattenTokenGroups,
	groupThemeVars,
	parseBridgeStats,
	parseThemeVars,
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
	ThemeVar,
	TokenSection,
	UsageCount,
	UtilityUnion,
} from "./types.ts";

// Facade over the analyze core primitives — consumers of ./collect get the
// whole collection toolbox from one specifier.
export { collectFiles, loadTwConfig } from "../analyze.ts";
export { runCli } from "../cli.ts";
export { classRules, cssBudget, sheetShape } from "../css-budget.ts";
