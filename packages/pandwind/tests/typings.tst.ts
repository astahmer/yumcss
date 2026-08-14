/**
 * Type-level contract of the generated `tw()` surface.
 *
 * These run under tstyche (not vitest) and pin the public typings:
 * autocomplete unions, variant nesting, compound bases, arrays, negative
 * keys and the open-ended value escape hatch.
 */
import { expect, test } from "tstyche";
import { tw } from "../../../apps/example/src/tw.ts";
import type { WindVariants } from "../../../apps/example/src/types.d.ts";

test("tw() always returns a class string", () => {
	expect(tw({ rounded: "xl" })).type.toBe<string>();
	expect(tw({})).type.toBe<string>();
});

test("utility keys and values come from the design system", () => {
	expect(tw({ bg: "sky-600", rounded: "2xl", p: "6" })).type.toBe<string>();
	expect(tw({ gridCols: "2", minH: "screen" })).type.toBe<string>();
});

test("nested variants stack to arbitrary depth", () => {
	expect(
		tw({
			hover: { bg: "gray-50" },
			sm: { p: "8" },
			dark: { hover: { text: "gray-300" } },
		}),
	).type.toBe<string>();
});

test("compound bases, booleans, arrays and negative keys typecheck", () => {
	expect(
		tw({
			flex: "col",
			relative: true,
			ring: ["1", "gray-900/5"],
			"-translateX": "1/2",
		}),
	).type.toBe<string>();
});

test("argument variants require a nested variant", () => {
	expect(tw({ group: { hover: { opacity: "100" } } })).type.toBe<string>();
	expect(tw({ max: { md: { bg: "red-500" } } })).type.toBe<string>();
	expect(tw({ aria: { checked: { bg: "sky-600" } } })).type.toBe<string>();
});

test("value unions stay open-ended (escape hatch)", () => {
	expect(tw({ rounded: "bogus-arbitrary" })).type.toBe<string>();
});

test("WindVariants is the parameter type of the generated tw", () => {
	const fn = tw as (styles: WindVariants) => string;
	expect(fn).type.toBeCallableWith({ rounded: "xl" });
	expect(fn).type.toBeCallableWith({ group: { hover: { opacity: "100" } } });
});

test("unknown utility keys are a type error", () => {
	// @ts-expect-error may only specify known properties
	tw({ bogus: "x" });
});
