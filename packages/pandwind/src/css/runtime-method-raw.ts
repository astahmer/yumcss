import type { StyleObject } from "../types/typings.ts";
import type { RuntimeCssAttachment } from "./runtime-base.ts";

/** Attach the uncompiled style-object projection used by stylesheet consumers. */
export const attachRaw: RuntimeCssAttachment = (css, context) => {
	css.raw = (...styles: Array<StyleObject>) => {
		const source = context.assign(...styles.map((style) => context.expandRaw(style)));
		const flat = context.flatten(source);
		for (const key of Object.keys(flat)) context.validate(key, flat[key]);
		return source;
	};
};
