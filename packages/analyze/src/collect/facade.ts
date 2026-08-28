import { analyzeStyleUsage, buildPruneChangeset, computeContrastWarnings } from "./analytics.ts";
import { gather } from "./gather.ts";
import {
	flattenTokenGroups,
	groupThemeVars,
	parseBridgeStats,
	parseThemeVars,
	parseUtilityUnions,
	resolveChain,
	splitTokenValue,
} from "./parsers.ts";
import { crawlCssImports } from "./theme-crawl.ts";
import {
	collectAuthoredCssImports,
	collectCssDiagnostics,
	collectCssProvenance,
	collectCssReport,
	formatAuthoredCssImports,
	formatCssDiagnostics,
} from "../css-diagnostics.ts";
import { collectFiles, loadTwConfig } from "../analyze.ts";
import { runCli } from "../cli.ts";
import { createCssBudgetService } from "../analysis-service.ts";

/** Cohesive collection domain facade. Methods are grouped by responsibility. */
export const CollectionToolkit = {
	gather,
	analyzeStyleUsage,
	buildPruneChangeset,
	computeContrastWarnings,
	flattenTokenGroups,
	groupThemeVars,
	parseBridgeStats,
	parseThemeVars,
	parseUtilityUnions,
	resolveChain,
	splitTokenValue,
	crawlCssImports,
	collectAuthoredCssImports,
	collectCssDiagnostics,
	collectCssProvenance,
	collectCssReport,
	formatAuthoredCssImports,
	formatCssDiagnostics,
	collectFiles,
	loadTwConfig,
	runCli,
	createCssBudgetService,
} as const;
