import { expect, test } from "tstyche";
import { createCss } from "../src/css/create-css.ts";
import { csstypePreset } from "../src/preset/csstype.ts";
import { defaultPreset } from "../src/preset/default.ts";
import { fixturePreset } from "./fixtures/fixture-preset.ts";

test("csstype preset exposes raw structural CSS without a stock token catalog", () => {
	const css = createCss(csstypePreset);

	expect(csstypePreset.tokens).type.toBe<{}>();
	expect(csstypePreset.properties).type.toBe<{ readonly $all: true }>();
	expect(
		css.class({ display: "flex", padding: "1rem", _hover: { color: "red.500" } }),
	).type.toBe<string>();
});

test("default preset exposes the stock property-token vocabulary", () => {
	const css = createCss(defaultPreset);

	expect(defaultPreset.tokens).type.toBe<{}>();
	expect(css.class({ color: "currentColor", padding: 4 })).type.toBe<string>();
	expect(css.class({ color: "oklch(0.637 0.237 25.331)" })).type.toBe<string>();
});

test("fixture preset keeps the named palette vocabulary", () => {
	const css = createCss(fixturePreset);

	expect(css.class({ color: "red.500", padding: 4 })).type.toBe<string>();
	expect(css.class({ backgroundColor: "whiteAlpha.500" })).type.toBe<string>();
});
