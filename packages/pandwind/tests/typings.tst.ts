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

test("semantic sub-keys accept their concern's values", () => {
	// Autocomplete-precision sugar: each sub-key's union is narrowed to its
	// concern (asserted in tw-typegen.test.ts), while the open-ended
	// `(string & {})` escape hatch keeps arbitrary values valid, same as the
	// base utilities.
	expect(tw({ textSize: "2xl", textColor: "gray-900", textAlign: "center" })).type.toBe<string>();
	expect(tw({ hover: { textColor: "sky-600/50" } })).type.toBe<string>();
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

test("bg / border / outline / decoration sub-keys are typed and accept real values", () => {
	expect(tw({ bgColor: "red-500", bgSize: "cover" })).type.toBe<string>();
	expect(
		tw({ bgPosition: "center", bgRepeat: "no-repeat", bgAttachment: "fixed" }),
	).type.toBe<string>();
	expect(
		tw({ borderWidth: "2", borderColor: "red-500", borderStyle: "dashed" }),
	).type.toBe<string>();
	expect(
		tw({ outlineWidth: "2", outlineColor: "red-500", outlineStyle: "dashed" }),
	).type.toBe<string>();
	expect(
		tw({ decorationColor: "red-500", decorationStyle: "dashed", decorationThickness: "4" }),
	).type.toBe<string>();
	expect(tw({ hover: { bgColor: "sky-600/50" } })).type.toBe<string>();
	// sub-keys remain open-ended like their bases
	expect(tw({ bgColor: "bogus-arbitrary" })).type.toBe<string>();
});

test("WindVariants is the parameter type of the generated tw", () => {
	const fn = tw as (styles: WindVariants) => string;
	expect(fn).type.toBeCallableWith({ rounded: "xl" });
	expect(fn).type.toBeCallableWith({ group: { hover: { opacity: "100" } } });
});

test("unknown utility keys are not part of the parameter surface", () => {
	// NOTE: pinned structurally instead of via @ts-expect-error — TS 7 no
	// longer applies excess-property checking through createTw's generic
	// signature, so the directive went stale (see plans/023 notes).
	expect<WindVariants>().type.not.toHaveProperty("bogus");
});
