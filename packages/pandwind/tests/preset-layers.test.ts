import { expect, test } from "vitest";
import { createCss } from "../src/css/create-css.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { basePreset, baseProperties } from "../src/preset/base.ts";
import { defaultPreset } from "../src/preset/default.ts";

test("base preset is a tokenless structural contract", () => {
	expect(baseProperties).toEqual({ $all: true });
	expect(basePreset.tokens).toEqual({});
	expect(basePreset.properties).toEqual({ $all: true });

	const css = createCss(basePreset);
	const output = createStylesheet(basePreset).generate([
		css.raw({ color: "red.500", padding: "1rem" }),
	]);

	expect(output).toContain("color:red.500");
	expect(output).toContain("padding:1rem");
});

test("default preset retains the stock token-aware property contract", () => {
	expect(defaultPreset.tokens).toEqual({});
	expect(defaultPreset.properties).toHaveProperty("padding");
	expect(defaultPreset.properties).toHaveProperty("color");

	const css = createCss(defaultPreset);
	const output = createStylesheet(defaultPreset).generate([
		css.raw({ color: "red.500", padding: 4 }),
	]);

	expect(output).toContain("color:#E53E3E");
	expect(output).toContain("padding:4px");
});
