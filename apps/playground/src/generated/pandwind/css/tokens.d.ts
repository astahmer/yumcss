// Generated from the workspace-linked pandwind package. Do not edit.
import type { CssConfigReturn, DefinePresetOptions, Token } from "../types/typings.d.ts";
export interface TokenMaps {
    tokensByProp: Map<string, Set<string>>;
    groupByProp: Map<string, string>;
    flatTokens: Map<string, Token>;
    tokensByGroup: Map<string, Set<string>>;
}
/** Precompute the preset's token lookup tables (build-time only). */
export declare function buildTokenMaps(preset: CssConfigReturn<DefinePresetOptions>, debug: boolean): TokenMaps;
/**
 * Resolve a written value to its concrete CSS value for `prop`.
 * Unknown values pass through unchanged — raw CSS values are always legal.
 */
export declare function resolveTokenValue(maps: TokenMaps, prop: string, valueOrTokenName: string, opts?: {
    concrete?: boolean;
}): string;
/** Convenience: build the maps once and get a (prop, value) resolver. */
export declare function createTokenResolver(preset: CssConfigReturn<DefinePresetOptions>, debug?: boolean): (prop: string, value: string) => string;
