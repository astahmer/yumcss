import { createCss } from "../../src/css/index.ts";

const preset = {
	conditions: { _hover: "&:hover" },
	properties: { $all: true },
	strict: true,
	tokens: {},
	_config: {},
};

const css = createCss(preset);

export const a = css.class({ color: "red", padding: "1rem" });
export const b = css({ _hover: { color: "blue" } });
