import type { StyleObject } from "../types/typings.ts";

const isMergeable = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const mergeInto = (target: Record<string, unknown>, source: Record<string, unknown>): void => {
	for (const key of Object.keys(source)) {
		const incoming = source[key];
		if (isMergeable(incoming)) {
			const existing = target[key];
			const branch = isMergeable(existing) ? existing : Object.create(null);
			target[key] = branch;
			mergeInto(branch, incoming);
			continue;
		}
		target[key] = incoming;
	}
};


export const assign = <T>(...arr: Array<T>) => {
	const result = Object.create(null) as Record<string, unknown>;
	for (const style of arr) {
		if (isMergeable(style)) mergeInto(result, style);
		else Object.assign(result, style);
	}
	return result as T;
};
export const cssVar = (key: string) => `--${key}`;
const dashCaseRegex = /[A-Z]/g;
export const dashCase = (string: string) =>
	string.replace(dashCaseRegex, (match) => `-${match.toLowerCase()}`);

const separator = "__";
const identitySeparator = "\u0000";

export type FlatStyles = Record<string, string>;

const flattenInto = (output: Record<string, unknown>, value: unknown, prefix: string): void => {
	if (value == null || (typeof value === "number" && !Number.isFinite(value))) return;
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
	for (const key of Object.keys(record)) {
		flattenInto(output, record[key], prefix ? `${prefix}${separator}${key}` : key);
	}
};

const flattenObject = (value: object): FlatStyles => {
	const output = Object.create(null) as Record<string, unknown>;
	flattenInto(output, value, "");
	return output as FlatStyles;
};

export const flattenStyle = (style: StyleObject) => {
	// Flat declarations are the dominant path. Keep their identity and avoid
	// allocation; nested values and nullish entries need the general traversal.
	for (const key of Object.keys(style)) {
		const value = style[key];
		if (
			value == null ||
			typeof value === "object" ||
			(typeof value === "number" && !Number.isFinite(value))
		)
			return flattenObject(style);
	}
	return style as FlatStyles;
};

export const flatten = <T>(obj: T) =>
	typeof obj === "object" && obj !== null ? flattenObject(obj) : (Object.create(null) as FlatStyles);

export const concatPair = (key: string, value: string) =>
	value.includes(separator)
		? `${key}${identitySeparator}${value}`
		: `${key}${separator}${value}`;
const splitPair = (pair: string) => pair.split(separator);
const joinParts = (parts: string[]) => parts.join(separator);

export const pairs = {
	concat: concatPair,
	split: splitPair,
	join: joinParts,
};
