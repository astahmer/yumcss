import type { StyleObject } from "../types/typings.ts";
import type { RuntimeCssAttachment } from "./runtime-base.ts";

export const attachRaw: RuntimeCssAttachment = (css, context) => {
	css.raw = (...styles: Array<StyleObject>) => context.assign(...styles);
};
