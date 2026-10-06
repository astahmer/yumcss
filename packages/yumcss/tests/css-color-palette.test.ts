import { expect, test } from "vitest";
import { createCss, createUnsafeCss } from "../src/css/create-css.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { createRuntimeCss, createRuntimeDesignCss } from "../src/css/runtime.ts";
import { createRuntimeStylesheet } from "../src/css/runtime-stylesheet.ts";
import { createDesignCss } from "../src/design/index.ts";
import { define } from "../src/preset/index.ts";
import type { StyleObject } from "../src/types/typings.ts";

const tokens = define.tokens({
	colors: {
		"blue.500": "#3182ce",
		"blue.700": "#2c5282",
		"gray.500": "#718096",
	},
});

const colorPalettes = tokens.defineColorPalettes({
	blue: "colors.blue",
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
		properties: define.properties({
			color: { $tokens: "colors" },
			backgroundColor: { $tokens: "colors" },
		}),
		colorPalettes,
	},
);

const explicitColorPreset = define.preset(
	{ config: {}, tokens },
	{
		strict: true,
		conditions: { base: "" },
		properties: {
			color: tokens.colors,
			backgroundColor: tokens.colors,
		},
		colorPalettes,
	},
);

const noPalettePreset = define.preset(
	{ config: {}, tokens },
	{
		strict: true,
		conditions: { base: "" },
		properties: define.properties({ $all: true }),
	},
);

test("compiles colorPalette assignment and virtual color references as static atoms", () => {
	const css = createCss(preset, { debug: true });

	expect(css.class({ colorPalette: "blue" })).toBe("colorPalette__blue");
	expect(css.class({ color: "colorPalette.500" })).toBe("color__colorPalette.500");
	expect(css.class({ colorPalette: "brand", color: "colorPalette.solid" })).toBe(
		"colorPalette__brand color__colorPalette.solid",
	);
});

test("emits one static palette rule with virtual custom-property assignments", () => {
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

test("omits unused palette mappings from used-token output", () => {
	const stylesheet = createStylesheet(preset, {}, { tokens: "used" });
	const output = stylesheet.generate([{ color: "blue.500" }]);

	expect(output).not.toContain("colorPalette");
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
	const paletteRule = output.slice(
		output.indexOf(".colorPalette__brand{"),
		output.indexOf(".colorPalette__brand{") + 500,
	);
	expect(paletteRule).toContain("var(--");
});

test("runtime sheets emit palette assignments and virtual color references", () => {
	const css = createRuntimeCss(preset, {
		debug: true,
		sheetOptions: { autoMount: false },
	});

	css.class({
		colorPalette: "brand",
		color: "colorPalette.solid",
		backgroundColor: "colorPalette.contrast",
	});

	const output = css.sheet.css();

	expect(output).toContain(".colorPalette__brand{");
	expect(output).toContain("color:var(--");
	expect(output).toContain("background-color:var(--");
	expect(output).not.toContain("color-palette:brand");
	expect(output).not.toContain("color:colorPalette.solid");
});

test("palette colors resolve with explicit color property maps", () => {
	const stylesheet = createStylesheet(explicitColorPreset, { debug: true });
	const output = stylesheet.generate([
		{
			colorPalette: "brand",
			backgroundColor: "colorPalette.contrast",
			color: "colorPalette.solid",
		},
	]);

	expect(output).toContain("backgroundColor__colorPalette\\.contrast{");
	expect(output).toContain("color__colorPalette\\.solid{");
	expect(output).toContain("background-color:var(--");
	expect(output).toContain("color:var(--");
	expect(output).not.toContain("background-color:colorPalette.contrast");
});

test("preset-bound CSS rejects undeclared palette assignments before atom registration", () => {
	const css = createCss(noPalettePreset);
	const invalidStyle: StyleObject = { colorPalette: "brand" };

	expect(() => {
		// @ts-expect-error Exercise the runtime guard with an invalid authored style.
		css(invalidStyle);
	}).toThrow(/colorPalette.*colorPalettes/);
	expect(() => {
		// @ts-expect-error Exercise the runtime guard with an invalid authored style.
		css.class(invalidStyle);
	}).toThrow(/colorPalette.*colorPalettes/);
	expect(() => css.vars(invalidStyle)).toThrow(/colorPalette.*colorPalettes/);
	expect(() => css.raw(invalidStyle)).toThrow(/colorPalette.*colorPalettes/);
	expect(() => {
		// @ts-expect-error Exercise the runtime guard with an invalid authored style.
		css.group({ card: invalidStyle });
	}).toThrow(/colorPalette.*colorPalettes/);

	const designCss = createDesignCss(noPalettePreset);
	const designStyle = { $raw: invalidStyle };
	expect(() => designCss.class(designStyle)).toThrow(/colorPalette.*colorPalettes/);
	const runtimeDesignCss = createRuntimeDesignCss(noPalettePreset, {
		sheetOptions: { autoMount: false },
	});
	expect(() => runtimeDesignCss.class(designStyle)).toThrow(/colorPalette.*colorPalettes/);

	const unsafeCss = createUnsafeCss();
	expect(unsafeCss.class(invalidStyle)).toMatch(/\S/);
});

test("static stylesheet extraction reports an unresolved palette instead of dropping its rule", () => {
	const stylesheet = createStylesheet(noPalettePreset, { debug: true });

	expect(() => stylesheet.generate([{ colorPalette: "brand" }])).toThrow(
		/colorPalette.*colorPalettes/,
	);
	expect(() => stylesheet.processVarKey("colorPalette")).toThrow(/colorPalette.*colorPalettes/);
});

test("runtime stylesheet extraction reports an unresolved palette", () => {
	const css = createRuntimeCss(noPalettePreset, { sheetOptions: { autoMount: false } });

	expect(() => {
		// @ts-expect-error Exercise the runtime guard with an undeclared palette.
		css.class({ colorPalette: "brand" });
	}).toThrow(/colorPalette.*colorPalettes/);
	const stylesheet = createRuntimeStylesheet(noPalettePreset);
	expect(() => stylesheet.processPrepared([{ key: "colorPalette", value: "brand" }])).toThrow(
		/colorPalette.*colorPalettes/,
	);
	expect(() => stylesheet.processVarKey("colorPalette")).toThrow(/colorPalette.*colorPalettes/);
	const output = css.sheet.css();
	expect(output).not.toContain("colorPalette");
});

test("token composers remain non-enumerable and compose immutable catalogs", () => {
	const conditions = { base: "", _dark: ".dark &" };
	const themedTokens = tokens.defineSemanticTokens(conditions, {
		colors: {
			surface: {
				base: "colors.blue.500",
				_dark: "colors.gray.500",
			},
		},
	});

	expect(Object.keys(tokens)).toEqual(["colors"]);
	expect(Object.keys(themedTokens)).toEqual(["colors"]);
	expect(themedTokens.colors).toMatchObject({
		"blue.500": "#3182ce",
		surface: { base: "colors.blue.500", _dark: "colors.gray.500" },
	});
	expect(Object.prototype.propertyIsEnumerable.call(tokens, "defineSemanticTokens")).toBe(false);
	expect(Object.prototype.propertyIsEnumerable.call(tokens, "defineColorPalettes")).toBe(false);
	expect(tokens).not.toHaveProperty("semantic");
	expect(themedTokens).toHaveProperty("colors.surface");
});
