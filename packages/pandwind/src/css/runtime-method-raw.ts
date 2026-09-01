import type { StyleObject } from "../types/typings.ts";
import type { RuntimeCssAttachment } from "./runtime-base.ts";

/** Attach the uncompiled style-object projection used by stylesheet consumers. */
export const attachRaw: RuntimeCssAttachment = (css, context) => {
	css.raw = (...styles: Array<StyleObject>) => context.assign(...styles);
};
