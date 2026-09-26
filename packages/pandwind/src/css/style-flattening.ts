import { assign, isSafePathPart, type FlatStyles, flattenStyle } from "../lib/utils.ts";
import type { StyleObject } from "../types/typings.ts";
import { expandRawStyle } from "./raw.ts";

const isStyleObject = (style: unknown): style is StyleObject =>
	typeof style === "object" && style !== null;

export const isFlatStyle = (style: unknown): style is StyleObject => {
	if (!isStyleObject(style) || Array.isArray(style)) return false;
	for (const key of Object.keys(style)) {
		const value = style[key];
		if (
			key === "$raw" ||
			!isSafePathPart(key) ||
			value == null ||
			typeof value === "object" ||
			(typeof value === "number" && !Number.isFinite(value))
		)
			return false;
	}
	return true;
};

export const flattenStyles = (...styles: Array<StyleObject>): FlatStyles => {
	if (styles.length === 1 && isFlatStyle(styles[0])) return styles[0] as FlatStyles;
	return flattenStyle(expandRawStyle(assign(...styles)), true);
};
