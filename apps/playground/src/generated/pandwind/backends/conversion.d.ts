// Generated from the workspace-linked pandwind package. Do not edit.
export declare const CSS_LENGTH: RegExp;
export type ShorthandSlot = readonly [suffix: string, valueIndex: number];
export declare const SIDE_EXPANSION: Readonly<Record<number, readonly ShorthandSlot[]>>;
export declare const CORNER_EXPANSION: Readonly<Record<number, readonly ShorthandSlot[]>>;
export declare function parseCssLength(value: string): number | undefined;
export declare function splitCssValue(value: string): string[];
export declare function expandShorthand(parts: readonly string[], table: Readonly<Record<number, readonly ShorthandSlot[]>>, convert: (value: string) => unknown, property: (suffix: string) => string): Record<string, unknown> | undefined;
