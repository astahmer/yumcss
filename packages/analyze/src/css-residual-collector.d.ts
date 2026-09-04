import type { TwConfig } from "pandwind/vite/inline";
export interface MissingCssSite {
    readonly line: number;
    readonly token: string;
}
export interface ArbitraryValueSite {
    readonly line: number;
    readonly token: string;
}
export interface CssResidualCollector {
    missingCss(values: readonly unknown[], lineStarts: readonly number[], start: number, config: TwConfig, ignore?: ReadonlySet<string>): readonly MissingCssSite[];
    arbitraryValues(values: readonly unknown[], lineStarts: readonly number[], start: number, ignore?: ReadonlySet<string>): readonly ArbitraryValueSite[];
}
export declare class DefaultCssResidualCollector implements CssResidualCollector {
    missingCss(values: readonly unknown[], lineStarts: readonly number[], start: number, config: TwConfig, ignore?: ReadonlySet<string>): readonly MissingCssSite[];
    arbitraryValues(values: readonly unknown[], lineStarts: readonly number[], start: number, ignore?: ReadonlySet<string>): readonly ArbitraryValueSite[];
}
