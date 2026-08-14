/**
 * Type-level contract of the design `css()` surface — the Figma-inspector
 * modules. Pins the public typings: token values, constrained options,
 * recursive conditions, the `$raw` escape hatch and the "wrong is a type
 * error" rules.
 */
import { expect, test } from "tstyche";
import { createDesignCss } from "../src/design/index.ts";
import type { DesignStyleObject } from "../src/design/types.ts";
import { examplePreset } from "../src/preset/example-preset.ts";

const css = createDesignCss(examplePreset);
type Compiled = Record<string, string>;

test("design css() accepts the three modules with token values", () => {
	expect(
		css({
			$frame: {
				w: "20",
				h: 40,
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
		css({
			$frame: { w: "20" },
			_hover: { $frame: { fill: "$blue-600" } },
			sm: { $text: { size: "2xl" } },
			_dark: { _hover: { $text: { color: "$red-300" } } },
		}),
	).type.toBe<Compiled>();
});

test("values come from the design tokens, with raw escapes for lengths", () => {
	expect(
		css({
			$frame: {
				fill: "success",
				corners: [8, "lg", 12, "full"],
				w: "50%",
			},
			$text: { weight: "semibold", font: "sans", spacing: { line: 1.5 } },
		}),
	).type.toBe<Compiled>();
});

test("off-system colors and typo'd options are type errors", () => {
	expect(
		css({
			// @ts-expect-error is not assignable
			$frame: { fill: "not-a-color" },
		}),
	).type.toBe<Compiled>();

	expect(
		css({
			// @ts-expect-error is not assignable
			$frame: { overflow: "clipp" },
		}),
	).type.toBe<Compiled>();

	expect(
		css({
			// @ts-expect-error is not assignable
			$layout: { flow: "stackz" },
		}),
	).type.toBe<Compiled>();

	expect(
		css({
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
		css({
			// @ts-expect-error may only specify known properties
			$frame: { borderRadius: "lg" },
		}),
	).type.toBe<Compiled>();

	expect(
		css({
			// @ts-expect-error may only specify known properties
			color: "$red-500",
		}),
	).type.toBe<Compiled>();
});

test("$raw is the escape hatch for everything else", () => {
	expect(
		css({
			$raw: {
				color: "$red-500",
				_hover: { backgroundColor: "$blue-500" },
				animation: "spin 1s linear infinite",
			},
		}),
	).type.toBe<Compiled>();
});

test("DesignStyleObject is the exported parameter type", () => {
	const fn = css as (
		styles: DesignStyleObject<typeof examplePreset>,
	) => Compiled;
	expect(fn).type.toBeCallableWith({ $frame: { w: "20" } });
	expect(fn).type.toBeCallableWith({ $layout: { flow: "grid", cols: 3 } });
});
