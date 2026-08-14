import { flattie } from "flattie";
import type { StyleObject } from "../types/typings.ts";

export const assign = <T>(...arr: Array<T>) =>
	arr.reduce((acc, style) => Object.assign(acc, style), {}) as T;
export const cssVar = (key: string) => `--${key}`;

const separator = "__";

export type FlatStyles = Record<string, string>;
export const flattenStyle = (style: StyleObject) =>
	flattie(style, separator) as FlatStyles;

export const flatten = <T>(obj: T) => flattie(obj, separator);

export const concatPair = (key: string, value: string) =>
	`${key}${separator}${value}`;
const splitPair = (pair: string) => pair.split(separator);
const joinParts = (parts: string[]) => parts.join(separator);

export const pairs = {
	concat: concatPair,
	split: splitPair,
	join: joinParts,
};
