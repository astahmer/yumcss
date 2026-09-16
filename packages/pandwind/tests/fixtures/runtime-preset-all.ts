import { createCss } from "../../src/css/index.ts";
import { createCx } from "../../src/cx/index.ts";
import { createTw } from "../../src/tw/index.ts";

const preset = {
	conditions: { _hover: "&:hover" },
	properties: { $all: true },
	strict: true,
	tokens: {},
	_config: {},
};

const css = createCss(preset);
const tw = createTw<Record<string, unknown>>({});
const cx = createCx({ css });

export const a = cx(tw({ bg: "red-500", p: "4" }), css.class({ color: "red" }), "flex");
