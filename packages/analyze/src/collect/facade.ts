import { analyzeStyleUsage, buildPruneChangeset, computeContrastWarnings } from "./analytics.ts";
import { gather } from "./gather.ts";
import {
	flattenTokenGroups,
	groupThemeVars,
	parseBridgeStats,
	parseThemeVars,
	parseThemeScopes,
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

/** Scoped collection domain façade; policies remain owned by their ports. */
export class CollectionToolkit {
	static readonly gather = gather;
	static readonly analyzeStyleUsage = analyzeStyleUsage;
	static readonly buildPruneChangeset = buildPruneChangeset;
	static readonly computeContrastWarnings = computeContrastWarnings;
	static readonly flattenTokenGroups = flattenTokenGroups;
	static readonly groupThemeVars = groupThemeVars;
	static readonly parseBridgeStats = parseBridgeStats;
	static readonly parseThemeVars = parseThemeVars;
	static readonly parseThemeScopes = parseThemeScopes;
	static readonly parseUtilityUnions = parseUtilityUnions;
	static readonly resolveChain = resolveChain;
	static readonly splitTokenValue = splitTokenValue;
	static readonly crawlCssImports = crawlCssImports;
	static readonly collectAuthoredCssImports = collectAuthoredCssImports;
	static readonly collectCssDiagnostics = collectCssDiagnostics;
	static readonly collectCssProvenance = collectCssProvenance;
	static readonly collectCssReport = collectCssReport;
	static readonly formatAuthoredCssImports = formatAuthoredCssImports;
	static readonly formatCssDiagnostics = formatCssDiagnostics;
	static readonly collectFiles = collectFiles;
	static readonly loadTwConfig = loadTwConfig;
	static readonly runCli = runCli;
	static readonly createCssBudgetService = createCssBudgetService;
}
