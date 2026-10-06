import { createCss } from "../../src/css/index.ts";

// The smallest preset that still exercises the preset-aware resolver:
// an open property catalog with no built-in token data, so this lane
// isolates engine + resolver bytes from the shipped token catalog.
const css = createCss({
	conditions: { _hover: "&:hover" },
	properties: { $all: true },
	strict: true,
	tokens: {},
	_config: {},
});

export const a = css.class({ color: "red", padding: "1rem" });
export const b = css({ color: "blue" });
