import type { StyleObject } from "../types/typings.ts";
import type { RuntimeCssAttachment } from "./runtime-base.ts";

/** Attach the class-string projection used by `css.class(...)`. */
export const attachClass: RuntimeCssAttachment = (css, context) => {
	css.class = (...styles: Array<StyleObject>) => {
		const compiled = context.compileStyles(...styles);
		let className = "";
		for (const key in compiled) {
			if (className) className += " ";
			className += compiled[key]!;
		}
		return className;
	};
};
