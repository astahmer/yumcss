import { expect, test } from "vitest";
import { createCss } from "../src/css/create-css.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { csstypePreset, csstypeProperties } from "../src/preset/csstype.ts";
import { defaultPreset } from "../src/preset/default.ts";
import { fixturePreset } from "./fixtures/fixture-preset.ts";

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
		css.raw({ color: "#e53e3e", padding: 4 }),
	]);

	expect(output).toContain("color:#e53e3e");
	expect(output).toContain("padding:4px");
});

test("default preset resolves CSS-wide color keywords and leaves colors authored", () => {
	const css = createCss(defaultPreset);
	const output = createStylesheet(defaultPreset).generate([
		css.raw({ color: "currentColor", backgroundColor: "transparent", borderColor: "red.500" }),
	]);

	expect(output).toContain("color:currentColor");
	expect(output).toContain("background-color:transparent");
	expect(output).toContain("border-color:red.500");
	expect(output).not.toContain(":root");
});

test("fixture preset still resolves its named palette", () => {
	expect(fixturePreset.tokens).toEqual({});

	const css = createCss(fixturePreset);
	const output = createStylesheet(fixturePreset).generate([
		css.raw({ color: "red.500", backgroundColor: "blue.500" }),
	]);

	expect(output).toContain("color:#e53e3e");
	expect(output).toContain("background-color:#3182ce");
	expect(output).not.toContain(":root");
});
