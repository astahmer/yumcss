import { expect, test } from "vitest";
import { createCss } from "../src/css/create-css.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { csstypePreset, csstypeProperties } from "../src/preset/csstype.ts";
import { defaultPreset } from "../src/preset/default.ts";

test("csstype preset is a tokenless structural contract", () => {
	expect(csstypeProperties).toEqual({ $all: true });
	expect(csstypePreset.tokens).toEqual({});
	expect(csstypePreset.properties).toEqual({ $all: true });

	const css = createCss(csstypePreset);
	const output = createStylesheet(csstypePreset).generate([
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

	expect(output).toContain("color:#e53e3e");
	expect(output).toContain("padding:4px");
});
