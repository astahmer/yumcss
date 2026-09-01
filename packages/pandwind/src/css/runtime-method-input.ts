import type { RuntimeCssAttachment } from "./runtime-base.ts";

export const attachInput: RuntimeCssAttachment = (css) => {
	css.input = (name: string) => `input>$${name}`;
};
