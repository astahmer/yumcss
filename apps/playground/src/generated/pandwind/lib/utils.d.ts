// Generated from the workspace-linked pandwind package. Do not edit.
import type { StyleObject } from "../types/typings.d.ts";
export declare const assign: <T>(...arr: Array<T>) => T;
export declare const cssVar: (key: string) => string;
export type FlatStyles = Record<string, string>;
export declare const flattenStyle: (style: StyleObject) => FlatStyles;
export declare const flatten: <T>(obj: T) => Record<string, any>;
export declare const concatPair: (key: string, value: string) => string;
declare const splitPair: (pair: string) => string[];
declare const joinParts: (parts: string[]) => string;
export declare const pairs: {
    concat: typeof concatPair;
    split: typeof splitPair;
    join: typeof joinParts;
};
export {};
