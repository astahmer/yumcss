import type { StyleObject } from "../types/typings.ts";

const isMergeable = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const mergeInto = (target: Record<string, unknown>, source: Record<string, unknown>): void => {
	type Frame = { target: Record<string, unknown>; source: Record<string, unknown>; keys: string[] };
	const active = new WeakSet<object>();
	const stack: Array<Omit<Frame, "index">> = [
		{ target, source, keys: Object.keys(source).reverse() },
	];
	active.add(source);
	while (stack.length > 0) {
		const frame = stack.at(-1)!;
		const key = frame.keys.pop();
		if (key === undefined) {
			stack.pop();
			active.delete(frame.source);
			continue;
		}
		const incoming = frame.source[key];
		if (isMergeable(incoming)) {
			if (active.has(incoming)) continue;
			const existing = frame.target[key];
			const branch = isMergeable(existing) ? existing : Object.create(null);
			frame.target[key] = branch;
			active.add(incoming);
			stack.push({ target: branch, source: incoming, keys: Object.keys(incoming).reverse() });
			continue;
		}
		frame.target[key] = incoming;
	}
};

export const assign = <T>(...arr: Array<T>) => {
	const result = Object.create(null) as Record<string, unknown>;
	for (const style of arr) {
		if (isMergeable(style)) mergeInto(result, style);
		else if (typeof style === "object" && style !== null && !Array.isArray(style))
			Object.assign(result, style);
	}
	return result as T;
};
export const cssVar = (key: string) => `--${key}`;
const dashCaseRegex = /[A-Z]/g;
export const dashCase = (string: string) =>
	string.replace(dashCaseRegex, (match) => `-${match.toLowerCase()}`);

const separator = "__";
const identitySeparator = "\u0000";

export const isSafePathPart = (part: string): boolean =>
	part.length > 0 && !part.includes(separator) && !part.includes(identitySeparator);

export type FlatStyles = Record<string, string>;

const nullResetValue = (property: string): string | number => {
	const cssProperty = dashCase(property);
	return cssProperty.endsWith("-width") && cssProperty.includes("border-") ? 0 : "initial";
};

const flattenInto = (
	output: Record<string, unknown>,
	value: unknown,
	prefix: string,
	resetNulls: boolean,
): void => {
	if (value == null || (typeof value === "number" && !Number.isFinite(value))) return;
	if (typeof value !== "object") {
		output[prefix] = value;
		return;
	}

	type Frame = {
		value: object;
		prefix: string;
		property: string;
		keys: string[];
	};
	const keysFor = (current: object): string[] => Object.keys(current).reverse();
	const active = new WeakSet<object>();
	const root: Frame = { value, prefix, property: "", keys: keysFor(value) };
	const stack: Frame[] = [root];
	active.add(value);
	while (stack.length > 0) {
		const frame = stack.at(-1)!;
		const key = frame.keys.pop();
		if (key === undefined) {
			stack.pop();
			active.delete(frame.value);
			continue;
		}
		if (!Array.isArray(frame.value) && !isSafePathPart(key)) continue;
		const child = Array.isArray(frame.value)
			? frame.value[Number(key)]
			: (frame.value as Record<string, unknown>)[key];
		const childPrefix = frame.prefix ? `${frame.prefix}${separator}${key}` : key;
		const childProperty = Array.isArray(frame.value) ? frame.property : key;
		if (child === null) {
			if (resetNulls) output[childPrefix] = nullResetValue(childProperty);
			continue;
		}
		if (child === undefined || (typeof child === "number" && !Number.isFinite(child))) continue;
		if (typeof child !== "object") {
			output[childPrefix] = child;
			continue;
		}
		if (active.has(child)) continue;
		active.add(child);
		stack.push({
			value: child,
			prefix: childPrefix,
			property: childProperty,
			keys: keysFor(child),
		});
	}
};

const flattenObject = (value: object, resetNulls: boolean): FlatStyles => {
	const output = Object.create(null) as Record<string, unknown>;
	flattenInto(output, value, "", resetNulls);
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
	typeof obj === "object" && obj !== null
		? flattenObject(obj, false)
		: (Object.create(null) as FlatStyles);

export const concatPair = (key: string, value: string) =>
	value.includes(separator) ? `${key}${identitySeparator}${value}` : `${key}${separator}${value}`;
const splitPair = (pair: string) => pair.split(separator);
const joinParts = (parts: string[]) => parts.join(separator);

export const pairs = {
	concat: concatPair,
	split: splitPair,
	join: joinParts,
};
