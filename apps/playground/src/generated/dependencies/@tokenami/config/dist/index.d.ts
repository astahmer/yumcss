// Generated from the workspace-linked pandwind package. Do not edit.
import * as CSS from 'csstype';
export { default as hash } from '@emotion/hash';

interface CSSProperties<TLength = (string & {}) | 0, TTime = string & {}> extends CSS.StandardPropertiesHyphen<TLength, TTime>, CSS.SvgPropertiesHyphen<TLength, TTime> {
}
interface CSSPropertiesWithVendor<TLength = (string & {}) | 0, TTime = string & {}> extends CSSProperties<TLength, TTime>, CSS.VendorPropertiesHyphen<TLength, TTime> {
}
type CSSProperty = keyof CSSProperties;
type Theme = {
    [themeKey: string]: {
        [themeToken: string]: string | number;
    };
};
type ThemeMode<T = Theme> = {
    [mode: string]: T;
};
type ThemeModes<T = Theme> = {
    root: Theme;
    modes: ThemeMode<T>;
};
type ThemeConfig = Theme | ThemeModes;
type Responsive = {
    [atRule: string]: string;
};
type Selector = string | string[];
type Selectors = {
    [name: string]: Selector;
};
type Aliases = Record<string, (keyof CSSPropertiesWithVendor)[]>;
type Properties = Partial<Record<CSSProperty | (string & {}), string[]>>;
type CustomProperties = Record<string, string[]>;
type ExactTheme<T> = T extends ThemeModes ? {
    [K in keyof T]: K extends 'root' | 'modes' ? T[K] : never;
} : {};
type ExactThemeKey<T> = ('grid' | 'number') | (T extends ThemeModes ? keyof T['modes'][keyof T['modes']] | keyof T['root'] : T extends Theme ? keyof T : string);
type ExactThemeModes<M> = M extends ThemeMode ? ThemeModes<UnionToIntersection<M[keyof M]>> : {};
type ExactProperties<P, T> = Partial<Record<keyof P, ExactThemeKey<T>[]>>;
interface Config<T extends ThemeConfig = ThemeConfig, P extends Properties = Properties, C extends CustomProperties = CustomProperties> {
    include: string[];
    exclude?: string[];
    grid?: string;
    globalStyles?: Record<string, CSS.Properties>;
    keyframes?: {
        [name: string]: {
            [step: string]: CSS.Properties;
        };
    };
    themeSelector: (mode: string) => Selector;
    theme: T & ExactTheme<T> & ExactThemeModes<T['modes']>;
    responsive?: Responsive;
    selectors?: Selectors;
    aliases?: Aliases;
    properties?: P & ExactProperties<P, T>;
    customProperties?: C & ExactProperties<C, T>;
}
type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (x: infer I) => void ? I : never;
type ExactConfig<Shape, T> = T extends Shape ? keyof T extends keyof Shape ? keyof Shape extends keyof T ? T : Shape : Shape : Shape;
declare function createConfig<C extends Config, T extends ThemeConfig, P extends Properties, CP extends CustomProperties>(config: ExactConfig<Config, C> & Config<T, P, CP>): C;

type GridProperty = '--_grid';
declare const GridProperty: {
    safeParse: (input: unknown) => Validated<"--_grid">;
};
declare function gridProperty(): GridProperty;
type GridValue = number;
declare const GridValue: {
    safeParse: (input: unknown) => Validated<number>;
};
type TokenProperty<P extends string = string> = `--${P}`;
declare const TokenProperty: {
    safeParse: (input: unknown) => Validated<`--${string}`>;
};
declare function tokenProperty(name: string): TokenProperty;
declare function parsedTokenProperty(name: string): TokenProperty;
type VariantProperty<P extends string = string, V extends string = string> = `--${V}_${P}`;
declare const VariantProperty: {
    safeParse: (input: unknown) => Validated<`--${string}_${string}`>;
};
declare function variantProperty(variant: string, name: string): VariantProperty;
declare function parsedVariantProperty(variant: string, name: string): VariantProperty;
type TokenValue<TK extends string = string, V extends string = string> = `var(--${TK}_${V})`;
declare const TokenValue: {
    safeParse: (input: unknown) => Validated<`var(--${string}_${string})`>;
};
declare function tokenValue<TK extends string, N extends string>(themeKey: TK, name: N): TokenValue<TK, N>;
type ArbitraryValue = `var(---,${string})`;
declare const ArbitraryValue: {
    safeParse: (input: unknown) => Validated<`var(---,${string})`>;
};
declare function arbitraryValue(value: string): ArbitraryValue;
type Validated<T> = {
    success: true;
    output: T;
} | {
    success: false;
};
declare function getTokenPropertyName(property: TokenProperty): string;
declare function getTokenPropertySplit(property: TokenProperty): {
    alias: string;
    variants: string[];
};
type PropertyParts = {
    alias: string;
    responsive?: string;
    selector?: string;
    variant?: string;
};
declare function getTokenPropertyParts(tokenProperty: TokenProperty, config: Config): PropertyParts | null;
declare function getArbitrarySelector(selector: string | undefined): string | undefined;
declare function getTokenValueParts(tokenValue: TokenValue): {
    property: string;
    themeKey: string;
    token: string;
};
declare function getCSSPropertiesForAlias(alias: string, aliases: Config['aliases']): string[];
declare function generateClassName(properties: Record<string, any>): string;
declare function createLonghandProperty(tokenProperty: TokenProperty, cssProperty: string): `--${string}`;
declare function parseProperty<T extends string>(str: T, options?: {
    escapeSpecialChars?: boolean;
}): T;
declare function stringifyProperty<T extends string>(property: T): T;
declare function iterateAliasProperties(styleEntries: [key: string, value: any][], config: Pick<Config, 'aliases'>): Generator<[string, any, {
    isCalc: boolean;
    cssProperties: string[];
}]>;
declare const calcProperty: (property: string) => `--${string}`;
declare const createLRUCache: <T = any>(limit?: number) => {
    get(key: string): T | undefined;
    set: (key: string, value: T) => void;
};

declare const mapShorthandToLonghands: Map<"flex" | "grid" | "all" | "border-block-color" | "border-block-style" | "border-block-width" | "border-inline-color" | "border-inline-style" | "border-inline-width" | "font-variant" | "animation" | "background" | "background-position" | "border" | "border-block" | "border-block-end" | "border-block-start" | "border-bottom" | "border-color" | "border-image" | "border-inline" | "border-inline-end" | "border-inline-start" | "border-left" | "border-radius" | "border-right" | "border-style" | "border-top" | "border-width" | "column-rule" | "columns" | "contain-intrinsic-size" | "container" | "flex-flow" | "font" | "gap" | "grid-area" | "grid-column" | "grid-row" | "grid-template" | "inset" | "inset-block" | "inset-inline" | "list-style" | "margin" | "margin-block" | "margin-inline" | "mask" | "mask-border" | "offset" | "outline" | "overflow" | "overscroll-behavior" | "padding" | "padding-block" | "padding-inline" | "place-content" | "place-items" | "place-self" | "scroll-margin" | "scroll-margin-block" | "scroll-margin-inline" | "scroll-padding" | "scroll-padding-block" | "scroll-padding-inline" | "scroll-timeline" | "text-decoration" | "text-emphasis" | "transition", string[]>;

export { type Aliases, ArbitraryValue, type CSSProperties, type CSSProperty, type Config, GridProperty, GridValue, type Selector, type Theme, type ThemeModes, TokenProperty, TokenValue, VariantProperty, arbitraryValue, calcProperty, createConfig, createLRUCache, createLonghandProperty, generateClassName, getArbitrarySelector, getCSSPropertiesForAlias, getTokenPropertyName, getTokenPropertyParts, getTokenPropertySplit, getTokenValueParts, gridProperty, iterateAliasProperties, mapShorthandToLonghands, parseProperty, parsedTokenProperty, parsedVariantProperty, stringifyProperty, tokenProperty, tokenValue, variantProperty };
