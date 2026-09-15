import { expect, test } from "tstyche";
import { createCss } from "../src/css/create-css.ts";
import {
	defineColorPalettes,
	definePreset,
	defineProperties,
	defineTokens,
	type ColorPaletteDefinitions,
} from "../src/preset/index.ts";

const tokens = defineTokens({
	colors: {
		"blue.500": "#3182ce",
		"gray.500": "#718096",
	},
});

const palettes = defineColorPalettes({
	brand: {
		contrast: "colors.gray.500",
		solid: "colors.blue.500",
	},
});

const preset = definePreset(
	{ config: {}, tokens },
	{
		strict: true,
		conditions: { base: "" },
		properties: defineProperties({ color: { $tokens: "colors" } }),
		colorPalettes: palettes,
	},
);

const css = createCss(preset);

test("color palettes expose only declared palette and virtual token names", () => {
	expect(css.class({ colorPalette: "brand", color: "colorPalette.solid" })).type.toBe<string>();

	css.class({
		// @ts-expect-error unknown palette name
		colorPalette: "unknown",
	});
	css.class({
		color:
			// @ts-expect-error unknown virtual palette token
			"colorPalette.unknown",
	});
});

test("color palette sources are checked against the preset color tokens", () => {
	const valid = {
		brand: "colors.blue",
	} satisfies ColorPaletteDefinitions<typeof tokens>;

	expect(valid).type.toBe<ColorPaletteDefinitions<typeof tokens>>();

	const invalid = {
		// @ts-expect-error unknown color palette source
		brand: "colors.missing",
	} satisfies ColorPaletteDefinitions<typeof tokens>;
	void invalid;
});
