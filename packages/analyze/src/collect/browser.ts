/** Browser-safe collection contracts and pure presentation helpers. */
export {
	flattenTokenGroups,
	groupThemeVars,
	resolveChain,
	splitTokenValue,
	parseBridgeStats,
	parseThemeScopes,
	parseThemeVars,
	parseUtilityUnions,
} from "./parsers.ts";
export { evaluateContrastPair } from "./analytics.ts";
export type { ContrastEvaluation, ContrastStatus } from "./types.ts";
export type { ThemeVarCategory } from "./parsers.ts";
export type {
	CollectPayload,
	StyleUsageReport,
	StyleValueCoverage,
	StyleValueCoverageSummary,
	ThemeVar,
	TokenSection,
	UtilityUnion,
} from "./types.ts";
