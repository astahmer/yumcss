import type { StyleObject } from "../types/typings.ts";

export const assign = <T>(...arr: Array<T>) =>
	arr.reduce((acc, style) => Object.assign(acc, style), {}) as T;
export const cssVar = (key: string) => `--${key}`;

const separator = "__";

export type FlatStyles = Record<string, string>;

const flattenInto = (output: Record<string, unknown>, value: unknown, prefix: string): void => {
	if (value == null) return;
	if (typeof value !== "object") {
		output[prefix] = value;
		return;
	}

	if (Array.isArray(value)) {
		for (let index = 0; index < value.length; index++) {
			flattenInto(output, value[index], prefix ? `${prefix}${separator}${index}` : `${index}`);
		}
		return;
	}

	const record = value as Record<string, unknown>;
	for (const key in record) {
		flattenInto(output, record[key], prefix ? `${prefix}${separator}${key}` : key);
	}
};

const flattenObject = (value: object): FlatStyles => {
	const output: Record<string, unknown> = {};
	flattenInto(output, value, "");
	return output as FlatStyles;
};

export const flattenStyle = (style: StyleObject) => {
	// Flat declarations are the dominant path. Keep their identity and avoid
	// allocation; nested values and nullish entries need the general traversal.
	for (const key in style) {
		const value = style[key];
		if (value == null || typeof value === "object") return flattenObject(style);
	}
	return style as FlatStyles;
};

export const flatten = <T>(obj: T) =>
	typeof obj === "object" && obj !== null ? flattenObject(obj) : ({} as FlatStyles);

export const concatPair = (key: string, value: string) => `${key}${separator}${value}`;
const splitPair = (pair: string) => pair.split(separator);
const joinParts = (parts: string[]) => parts.join(separator);

export const pairs = {
	concat: concatPair,
	split: splitPair,
	join: joinParts,
};
