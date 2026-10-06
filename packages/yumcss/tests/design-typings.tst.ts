/**
 * Type-level contract of the design `dss()` surface — the Figma-inspector
 * modules. Pins the public typings: token values, constrained options,
 * recursive conditions, the `$raw` escape hatch and the "wrong is a type
 * error" rules.
 */
import { expect, test } from "tstyche";
import { createDesignCss } from "yumcss/design";
import type { DesignStyleObject } from "yumcss/design";
import { examplePreset } from "@yumcss/example-preset";

const dss = createDesignCss(examplePreset);
type Compiled = Record<string, string>;

test("design dss() accepts the three modules with token values", () => {
	expect(
		dss({
			$frame: {
				w: "20",
				h: "40px",
				corners: "lg",
				fill: "$blue-500",
				pad: [4, 8],
				overflow: "clip",
				z: 10,
				opacity: 50,
			},
			$layout: {
				flow: "stackY",
				gap: "16",
				align: "top-center",
				wrap: true,
			},
			$text: {
				size: "xl",
				weight: 600,
				color: "$red-300",
				case: "upper",
				truncate: true,
			},
		}),
	).type.toBe<Compiled>();
});

test("conditions nest modules to arbitrary depth", () => {
	expect(
		dss({
			$frame: { w: "20" },
			_hover: { $frame: { fill: "$blue-600" } },
			sm: { $text: { size: "2xl" } },
			_dark: { _hover: { $text: { color: "$red-300" } } },
		}),
	).type.toBe<Compiled>();
});

test("values come from the design tokens, with raw escapes for lengths", () => {
	expect(
		dss({
			$frame: {
				fill: "success",
				corners: ["8px", "lg", "12px", "full"],
				w: "50%",
			},
			$text: { weight: "semibold", font: "sans", spacing: { line: 1.5 } },
		}),
	).type.toBe<Compiled>();
});

test("off-system colors and typo'd options are type errors", () => {
	expect(
		dss({
			// @ts-expect-error is not assignable
			$frame: { fill: "not-a-color" },
		}),
	).type.toBe<Compiled>();

	expect(
		dss({
			// @ts-expect-error is not assignable
			$frame: { overflow: "clipp" },
		}),
	).type.toBe<Compiled>();

	expect(
		dss({
			// @ts-expect-error is not assignable
			$layout: { flow: "stackz" },
		}),
	).type.toBe<Compiled>();

	expect(
		dss({
			$text: {
				color: "$blue-500",
				// @ts-expect-error is not assignable
				align: "middle",
			},
		}),
	).type.toBe<Compiled>();
});

test("unknown module props and raw top-level props are type errors", () => {
	expect(
		dss({
			// @ts-expect-error may only specify known properties
			$frame: { borderRadius: "lg" },
		}),
	).type.toBe<Compiled>();

	expect(
		dss({
			// @ts-expect-error may only specify known properties
			color: "$red-500",
		}),
	).type.toBe<Compiled>();
});

test("$raw is the escape hatch for everything else", () => {
	expect(
		dss({
			$raw: {
				color: "$red-500",
				_hover: { backgroundColor: "$blue-500" },
				animation: "spin 1s linear infinite",
			},
		}),
	).type.toBe<Compiled>();
});

test("DesignStyleObject is the exported parameter type", () => {
	const fn = dss as (styles: DesignStyleObject<typeof examplePreset>) => Compiled;
	expect(fn).type.toBeCallableWith({ $frame: { w: "20" } });
	expect(fn).type.toBeCallableWith({ $layout: { flow: "grid", cols: 3 } });
});
