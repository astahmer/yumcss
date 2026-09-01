import { flattie } from "flattie";
import type { StyleObject } from "../types/typings.ts";

export const assign = <T>(...arr: Array<T>) =>
	arr.reduce((acc, style) => Object.assign(acc, style), {}) as T;
export const cssVar = (key: string) => `--${key}`;

const separator = "__";

export type FlatStyles = Record<string, string>;
export const flattenStyle = (style: StyleObject) => {
	// `flattie` is still required for conditions and array values, but the
	// overwhelmingly common flat object does not need a new object at all.
	// Null/undefined deliberately stay on the general path because flattie
	// omits them; false and numeric values are preserved for downstream policy.
	for (const value of Object.values(style)) {
		if (value === null || value === undefined || typeof value === "object") {
			return flattie(style, separator) as FlatStyles;
		}
	}
	return style as FlatStyles;
};

export const flatten = <T>(obj: T) => flattie(obj, separator);

export const concatPair = (key: string, value: string) => `${key}${separator}${value}`;
const splitPair = (pair: string) => pair.split(separator);
const joinParts = (parts: string[]) => parts.join(separator);

export const pairs = {
	concat: concatPair,
	split: splitPair,
	join: joinParts,
};
