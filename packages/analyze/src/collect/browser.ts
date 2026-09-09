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
export type { ThemeVarCategory } from "./parsers.ts";
export type { CollectPayload, ThemeVar, TokenSection, UtilityUnion } from "./types.ts";
