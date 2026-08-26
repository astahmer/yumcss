import { expect, test } from "tstyche";
import { createCss } from "../src/css/create-css.ts";
import { examplePreset } from "../src/preset/example-preset.ts";

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
			// @ts-expect-error
			boxShadow: "lg",
		}),
	).type.toBe<Compiled>();

	expect(
		css({
			// @ts-expect-error
			backgroundColor: "not-a-color",
		}),
	).type.toBe<Compiled>();
});

test("the untyped convenience form remains available", () => {
	const loose = createCss();
	expect(loose({ arbitraryProperty: "value" })).type.toBe<Compiled>();
});
