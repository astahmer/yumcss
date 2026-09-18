import { expect, test } from "tstyche";
import { createCss, createUnsafeCss } from "../src/css/create-css.ts";
import { createRuntimeCss, createRuntimeDesignCss } from "../src/css/runtime.ts";
import { createDesignCss } from "../src/design/index.ts";
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

const noPalettePreset = define.preset(
	{ config: {}, tokens },
	{
		strict: true,
		conditions: { base: "" },
		properties: define.properties({ $all: true }),
	},
);

const noPaletteCss = createCss(noPalettePreset);
const noPaletteDesignCss = createDesignCss(noPalettePreset);
const noPaletteRuntimeCss = createRuntimeCss(noPalettePreset, {
	sheetOptions: { autoMount: false },
});
const noPaletteRuntimeDesignCss = createRuntimeDesignCss(noPalettePreset, {
	sheetOptions: { autoMount: false },
});
const unsafeCss = createUnsafeCss();

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

test("preset-bound surfaces reserve colorPalette without configured palettes", () => {
	noPaletteCss({
		// @ts-expect-error not assignable
		colorPalette: "brand",
	});
	noPaletteCss.class({
		// @ts-expect-error not assignable
		colorPalette: "brand",
	});
	noPaletteCss.vars({
		// @ts-expect-error not assignable
		colorPalette: "brand",
	});
	noPaletteCss.raw({
		// @ts-expect-error not assignable
		colorPalette: "brand",
	});
	noPaletteCss.group({
		card: {
			// @ts-expect-error not assignable
			colorPalette: "brand",
		},
	});
	noPaletteCss.class({
		_dark: {
			// @ts-expect-error may only specify known properties
			colorPalette: "brand",
		},
	});
	noPaletteDesignCss.raw({
		$raw: {
			colorPalette: "brand",
		},
	});
	noPaletteDesignCss.raw({
		$raw: {
			_dark: {
				colorPalette: "brand",
			},
		},
	});
	noPaletteDesignCss.vars({
		$raw: {
			// @ts-expect-error not assignable
			colorPalette: "brand",
		},
	});
	noPaletteRuntimeCss.class({
		// @ts-expect-error not assignable
		colorPalette: "brand",
	});
	noPaletteRuntimeCss.vars({
		// @ts-expect-error not assignable
		colorPalette: "brand",
	});
	noPaletteRuntimeCss.raw({
		colorPalette: "brand",
	});
	noPaletteRuntimeDesignCss.raw({
		$raw: {
			colorPalette: "brand",
		},
	});
});

test("unsafe CSS keeps the intentionally open palette escape hatch", () => {
	expect(unsafeCss.class({ colorPalette: "brand" })).type.toBe<string>();
});
