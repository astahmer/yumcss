import type { RuntimeCssAttachment } from "./runtime-base.ts";

/** Attach the named-input marker consumed by dynamic `css.group` definitions. */
export const attachInput: RuntimeCssAttachment = (css) => {
	css.input = (name: string) => `input>$${name}`;
};
