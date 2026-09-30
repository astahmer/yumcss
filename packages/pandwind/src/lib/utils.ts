import type { StyleObject } from "../types/typings.ts";

const isMergeable = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const mergeInto = (
	target: Record<string, unknown>,
	source: Record<string, unknown>,
	active: WeakSet<object>,
): void => {
	if (active.has(source)) return;
	active.add(source);
	for (const key of Object.keys(source)) {
		const incoming = source[key];
		if (isMergeable(incoming)) {
			if (active.has(incoming)) continue;
			const existing = target[key];
			const branch = isMergeable(existing) ? existing : Object.create(null);
			target[key] = branch;
			mergeInto(branch, incoming, active);
			continue;
		}
		target[key] = incoming;
	}
	active.delete(source);
};

export const assign = <T>(...arr: Array<T>) => {
	const result = Object.create(null) as Record<string, unknown>;
	const active = new WeakSet<object>();
	for (const style of arr) {
		if (isMergeable(style)) mergeInto(result, style, active);
		else if (typeof style === "object" && style !== null && !Array.isArray(style))
			Object.assign(result, style);
	}
	return result as T;
};
export const cssVar = (key: string) => `--${key}`;
const dashCaseRegex = /[A-Z]/g;
const hasUppercase = /[A-Z]/;
export const dashCase = (string: string) =>
	hasUppercase.test(string)
		? string.replace(dashCaseRegex, (match) => `-${match.toLowerCase()}`)
		: string;

const separator = "__";
const identitySeparator = "\u0000";

export const isSafePathPart = (part: string): boolean =>
	part.length > 0 && !part.includes(separator) && !part.includes(identitySeparator);

export type FlatStyles = Record<string, string>;
type Flattenable = StyleObject | readonly unknown[];

const isFlattenable = (value: unknown): value is Flattenable =>
	Array.isArray(value) || isMergeable(value);

const nullResetValue = (property: string): string | number => {
	const cssProperty = dashCase(property);
	return cssProperty.endsWith("-width") && cssProperty.includes("border-") ? 0 : "initial";
};

const flattenInto = (
	output: Record<string, unknown>,
	value: unknown,
	prefix: string,
	property: string,
	resetNulls: boolean,
	active: WeakSet<object>,
): void => {
	if (value == null || (typeof value === "number" && !Number.isFinite(value))) return;
	if (typeof value !== "object") {
		output[prefix] = value;
		return;
	}
	if (active.has(value)) return;
	active.add(value);
	if (Array.isArray(value)) {
		for (let index = 0; index < value.length; index++) {
			const child = value[index];
			const childPrefix = prefix ? `${prefix}${separator}${index}` : `${index}`;
			if (child === null) {
				if (resetNulls) output[childPrefix] = nullResetValue(property);
				continue;
			}
			flattenInto(output, child, childPrefix, property, resetNulls, active);
		}
	} else {
		for (const key of Object.keys(value)) {
			if (!isSafePathPart(key)) continue;
			const child = (value as Record<string, unknown>)[key];
			const childPrefix = prefix ? `${prefix}${separator}${key}` : key;
			if (child === null) {
				if (resetNulls) output[childPrefix] = nullResetValue(key);
				continue;
			}
			flattenInto(output, child, childPrefix, key, resetNulls, active);
		}
	}
	active.delete(value);
};

const flattenObject = (value: Flattenable, resetNulls: boolean): FlatStyles => {
	const output = Object.create(null) as Record<string, unknown>;
	flattenInto(output, value, "", "", resetNulls, new WeakSet<object>());
	return output as FlatStyles;
};

export const flattenStyle = (style: StyleObject, resetNulls = false) => {
	// Flat declarations are the dominant path. Keep their identity and avoid
	// allocation; nested values and nullish entries need the general traversal.
	for (const key of Object.keys(style)) {
		const value = style[key];
		if (
			!isSafePathPart(key) ||
			value == null ||
			typeof value === "object" ||
			(typeof value === "number" && !Number.isFinite(value))
		)
			return flattenObject(style, resetNulls);
	}
	return style as FlatStyles;
};

export const flatten = <T>(obj: T) =>
	isFlattenable(obj) ? flattenObject(obj, false) : (Object.create(null) as FlatStyles);

export const concatPair = (key: string, value: string) =>
	value.includes(separator) ? `${key}${identitySeparator}${value}` : `${key}${separator}${value}`;
const splitPair = (pair: string) => pair.split(separator);
const joinParts = (parts: string[]) => parts.join(separator);

export const pairs = {
	concat: concatPair,
	split: splitPair,
	join: joinParts,
};
