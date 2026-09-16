import { expect, test } from "tstyche";
import { createCss, firstThatWorks } from "../src/css/index.ts";
import { examplePreset } from "@pandwind/example-preset";

const css = createCss(examplePreset);

test("firstThatWorks is a typed CSS value", () => {
	const fallback = firstThatWorks("sticky", "-webkit-sticky", "fixed");

	expect(fallback).type.toBeAssignableTo<string>();
	expect(css.class({ display: fallback })).type.toBe<string>();
	expect(css({ display: firstThatWorks("flex", "block") })).type.toBe<Record<string, string>>();
	// @ts-expect-error Type 'FirstThatWorksValue' is not assignable to type
	css.class({ colorPalette: firstThatWorks("brand", "gray") });
});

test("firstThatWorks requires at least two CSS values", () => {
	// @ts-expect-error Expected at least 2 arguments, but got 1.
	firstThatWorks("sticky");
	// @ts-expect-error Expected at least 2 arguments, but got 0.
	firstThatWorks();
	// @ts-expect-error Argument of type 'boolean' is not assignable to parameter of type 'FirstThatWorksScalar'.
	firstThatWorks(true, "fixed");
});
