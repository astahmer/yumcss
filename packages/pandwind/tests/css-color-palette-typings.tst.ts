import { expect, test } from "tstyche";
import { createCss } from "../src/css/create-css.ts";
import { define } from "../src/preset/index.ts";

const tokens = define.tokens({
	colors: {
		"blue.500": "#3182ce",
		"gray.500": "#718096",
	},
});

const palettes = tokens.defineColorPalettes({
	brand: {
		contrast: "colors.gray.500",
		solid: "colors.blue.500",
	},
});

const preset = define.preset(
	{ config: {}, tokens },
	{
		strict: true,
		conditions: { base: "" },
		properties: define.properties({ color: { $tokens: "colors" } }),
		colorPalettes: palettes,
	},
);

const css = createCss(preset);

test("color palettes expose only declared palette and virtual token names", () => {
	expect(css.class({ colorPalette: "brand", color: "colorPalette.solid" })).type.toBe<string>();

	css.class({
		// @ts-expect-error not assignable
		colorPalette: "unknown",
	});
	css.class({
		// @ts-expect-error not assignable
		color: "colorPalette.unknown",
	});
});

test("color palette sources are checked against the preset color tokens", () => {
	const valid = tokens.defineColorPalettes({
		brand: "colors.blue",
	});

	expect(valid).type.toBe<{ brand: "colors.blue" }>();

	tokens.defineColorPalettes({
		brand: {
			// @ts-expect-error not assignable
			solid: "colors.missing",
		},
	});
});
