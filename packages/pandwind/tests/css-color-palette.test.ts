import { expect, test } from "vitest";
import { createCss } from "../src/css/create-css.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import {
	defineColorPalettes,
	definePreset,
	defineProperties,
	defineTokens,
} from "../src/preset/index.ts";

const tokens = defineTokens({
	colors: {
		"blue.500": "#3182ce",
		"blue.700": "#2c5282",
		"gray.500": "#718096",
	},
});

const colorPalettes = defineColorPalettes({
	blue: "colors.blue",
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
		properties: defineProperties({
			color: { $tokens: "colors" },
			backgroundColor: { $tokens: "colors" },
		}),
		colorPalettes,
	},
);

test("compiles colorPalette assignment and virtual color references as static atoms", () => {
	const css = createCss(preset, { debug: true });

	expect(css.class({ colorPalette: "blue" })).toBe("colorPalette__blue");
	expect(css.class({ color: "colorPalette.500" })).toBe("color__colorPalette.500");
	expect(
		css.class({ colorPalette: "brand", color: "colorPalette.solid" }),
	).toBe("colorPalette__brand color__colorPalette.solid");
});

test("emits one static palette rule with virtual custom-property assignments", () => {
	const css = createCss(preset, { debug: true });
	const stylesheet = createStylesheet(preset, { debug: true });
	const output = stylesheet.generate([
		{
			colorPalette: "blue",
			color: "colorPalette.500",
		},
	]);

	expect(output).toContain(".colorPalette__blue{");
	expect(output).toContain(".color__colorPalette\\.500{");
	expect(output).toContain("--colors");
	expect(output).toContain("var(--");
	expect(output).not.toContain("color-palette:blue");
	expect(output).not.toContain("color-palette: blue");
});

test("keeps palette aliases and their token references on the same virtual variables", () => {
	const stylesheet = createStylesheet(preset, { debug: true });
	const output = stylesheet.generate([
		{
			colorPalette: "brand",
			color: "colorPalette.solid",
			backgroundColor: "colorPalette.contrast",
		},
	]);

	expect(output).toContain(".colorPalette__brand{");
	expect(output).toContain("color__colorPalette\\.solid{");
	expect(output).toContain("backgroundColor__colorPalette\\.contrast{");
	const paletteRule = output.slice(output.indexOf(".colorPalette__brand{"), output.indexOf(".colorPalette__brand{") + 500);
	expect(paletteRule).toContain("var(--");
});
