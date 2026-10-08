import type { StyleObject } from "../types/typings.ts";
import type { RuntimeCssAttachment } from "./runtime-base.ts";

const mergeFlatStyles = (styles: readonly StyleObject[]): StyleObject | undefined => {
	const result = Object.create(null) as StyleObject;
	for (const style of styles) {
		for (const key of Object.keys(style)) {
			const value = style[key];
			if (value !== null && typeof value === "object" && !Array.isArray(value)) return undefined;
			result[key] = value;
		}
	}
	return result;
};

/** Attach the uncompiled style-object projection used by stylesheet consumers. */
export const attachRaw: RuntimeCssAttachment = (css, context) => {
	css.raw = (...styles: Array<StyleObject>) => {
		const expandedStyles = styles.map((style) => context.expandRaw(style));
		const source = mergeFlatStyles(expandedStyles) ?? context.assign(...expandedStyles);
		const flat = context.flatten(source);
		for (const key of Object.keys(flat)) context.validate(key, flat[key]);
		return { ...source };
	};
};
