import { createCss } from "../../src/css/index.ts";
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

export const a = tw({ bg: ["red-500", "blue-500"] });
export const b = css.class({ color: "red", padding: "1rem" });
