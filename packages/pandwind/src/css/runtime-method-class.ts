import type { StyleObject } from "../types/typings.ts";
import type { RuntimeCssAttachment } from "./runtime-base.ts";

/** Attach the class-string projection used by `css.class(...)`. */
export const attachClass: RuntimeCssAttachment = (css, context) => {
	css.class = (...styles: Array<StyleObject>) =>
		Object.values(context.compileStyles(...styles)).join(" ");
};
