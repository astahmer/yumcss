import { expect, test } from "tstyche";
import { createCss } from "../src/css/create-css.ts";
import { basePreset } from "../src/preset/base.ts";
import { defaultPreset } from "../src/preset/default.ts";

test("base preset exposes raw structural CSS without a stock token catalog", () => {
	const css = createCss(basePreset);

	expect(basePreset.tokens).type.toBe<{}>();
	expect(basePreset.properties).type.toBe<{ readonly $all: true }>();
	expect(
		css.class({ display: "flex", padding: "1rem", _hover: { color: "red.500" } }),
	).type.toBe<string>();
});

test("default preset exposes the stock property-token vocabulary", () => {
	const css = createCss(defaultPreset);

	expect(defaultPreset.tokens).type.toBe<{}>();
	expect(css.class({ color: "red.500", padding: 4 })).type.toBe<string>();
});
