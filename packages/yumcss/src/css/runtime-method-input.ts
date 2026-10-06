import type { RuntimeCssAttachment } from "./runtime-base.ts";

/** Attach the named-input marker consumed by dynamic `css.group` definitions. */
export const attachInput: RuntimeCssAttachment = (css) => {
	css.input = (name: string) => {
		if (typeof name !== "string" || !/^[-_A-Za-z][-_A-Za-z0-9]*$/.test(name))
			throw new Error("yumcss: css.input() names must be CSS-safe identifiers");
		return `input>$${name}`;
	};
};
