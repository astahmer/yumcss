import { expect, test } from "tstyche";
import { createCss } from "../src/css/create-css.ts";
import { definePreset, type AnyCssConfig } from "../src/preset/index.ts";
import { examplePreset } from "@pandwind/example-preset";

const css = createCss(examplePreset);
type Compiled = Record<string, string>;

test("createCss binds ordinary properties and preset token values", () => {
	expect(
		css({
			color: "$red-500",
			backgroundColor: "$blue-500",
			_hover: { color: "$red-700" },
		}),
	).type.toBe<Compiled>();
});

test("createCss rejects properties and token values outside the preset", () => {
	expect(
		css({
			// @ts-expect-error does not exist in type
			boxShadow: "lg",
		}),
	).type.toBe<Compiled>();

	expect(
		css({
			// @ts-expect-error not assignable
			backgroundColor: "not-a-color",
		}),
	).type.toBe<Compiled>();
});

test("the untyped convenience form remains available", () => {
	const loose = createCss();
	expect(loose({ arbitraryProperty: "value" })).type.toBe<Compiled>();
});

test("an open preset config keeps arbitrary CSS properties typed", () => {
	const preset = definePreset(
		{ config: {} as AnyCssConfig, tokens: {} },
		{ strict: true, conditions: {}, properties: { $all: true } },
	);
	const generated = createCss(preset);
	expect(generated.class({ backgroundColor: "var(--brand)", color: "white" })).type.toBe<string>();
});
