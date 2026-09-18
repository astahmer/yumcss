import { assign } from "../lib/utils.ts";
import type { StyleObject } from "../types/typings.ts";

const isStyleObject = (value: unknown): value is StyleObject =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const emptyStyle = Object.create(null) as StyleObject;

const containsRawStyle = (style: StyleObject, active = new WeakSet<object>()): boolean => {
	if (active.has(style)) return false;
	active.add(style);
	for (const key of Object.keys(style)) {
		if (key === "$raw") {
			active.delete(style);
			return true;
		}
		const value = style[key];
		if (isStyleObject(value) && containsRawStyle(value, active)) {
			active.delete(style);
			return true;
		}
	}
	active.delete(style);
	return false;
};

/** Expand preset-bound raw subtrees while preserving authored object order. */
export const expandRawStyle = (style: unknown, active = new WeakSet<object>()): StyleObject => {
	if (!isStyleObject(style)) return emptyStyle;
	if (!containsRawStyle(style)) return style;
	if (active.has(style)) return emptyStyle;
	active.add(style);
	const parts: StyleObject[] = [];
	for (const key of Object.keys(style)) {
		const value = style[key];
		if (key === "$raw") {
			if (isStyleObject(value)) parts.push(expandRawStyle(value, active));
			continue;
		}
		if (isStyleObject(value)) {
			parts.push({ [key]: expandRawStyle(value, active) });
			continue;
		}
		parts.push({ [key]: value });
	}
	active.delete(style);
	return assign(...parts);
};
