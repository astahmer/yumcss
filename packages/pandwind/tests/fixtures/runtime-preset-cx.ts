import { createCss } from "../../src/css/index.ts";
import { createCx } from "../../src/cx/index.ts";

const preset = {
	conditions: { _hover: "&:hover" },
	properties: { $all: true },
	strict: true,
	tokens: {},
	_config: {},
};

const css = createCss(preset);
const cx = createCx({ css });

export const a = cx("flex", css.class({ color: "red" }), css({ bg: "blue" }));
