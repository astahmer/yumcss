/**
 * OpenTUI backend + `yumcss/opentui` surface (plans/021 step 4).
 *
 * Pins what is OpenTUI-specific on top of the shared object skeleton:
 *
 * - unit policy (declared-with-default): px/rem lengths quantize to
 *   terminal cells via `round(px / cellSize)`, cellSize defaults to 4;
 *   percent/auto and non-length values pass through as strings;
 * - border model: the CSS `border` shorthand becomes OpenTUI's
 *   `border: true` plus `borderColor` when a color is present (terminals
 *   have no width concept — thickness is implicitly one cell);
 * - typography-shape and cascade/paint-only props throw (fail fast);
 * - the design vocabulary lowers to cells; `_dark` follows the resolver,
 *   other conditions throw; identical styles keep stable identity.
 */
import { describe, expect, test } from "vitest";
import { createOpentuiBackend } from "../src/backends/opentui.ts";
import { createDesignCss, createCx } from "../src/opentui.ts";
import { examplePreset } from "@yumcss/example-preset";

describe("opentui unit policy", () => {
	test("lengths quantize to cells with the default cellSize of 4", () => {
		const backend = createOpentuiBackend();
		expect(backend.declare("width", "20px")).toEqual({ width: 5 });
		// Rounding, not truncation: 21px / 4 = 5.25 -> 5; 22px -> 6.
		expect(backend.declare("width", "21px")).toEqual({ width: 5 });
		expect(backend.declare("width", "22px")).toEqual({ width: 6 });
	});

	test("cellSize overrides the default (declared-with-default policy)", () => {
		const backend = createOpentuiBackend({ cellSize: 8 });
		expect(backend.declare("width", "20px")).toEqual({ width: 3 }); // 20/8 = 2.5, rounds half up
		expect(backend.declare("gap", "1px")).toEqual({ gap: 0 });
	});

	test("rem resolves through the 16px root font size first", () => {
		const backend = createOpentuiBackend();
		expect(backend.declare("width", "0.5rem")).toEqual({ width: 2 });
		expect(backend.declare("width", ".5rem")).toEqual({ width: 2 });
	});

	test("negative lengths stay negative after rounding", () => {
		const backend = createOpentuiBackend();
		expect(backend.declare("top", "-4px")).toEqual({ top: -1 });
	});

	test("bare numeric strings count as px before quantizing", () => {
		const backend = createOpentuiBackend();
		expect(backend.declare("marginTop", "10")).toEqual({ marginTop: 3 });
	});

	test("percent/auto and non-length values pass through as strings", () => {
		const backend = createOpentuiBackend();
		expect(backend.declare("width", "50%")).toEqual({ width: "50%" });
		expect(backend.declare("flexDirection", "column")).toEqual({ flexDirection: "column" });
	});

	test("unit conversion follows the target property contract", () => {
		const backend = createOpentuiBackend();
		expect(backend.declare("opacity", "0.5")).toEqual({ opacity: 0.5 });
		expect(() => backend.declare("opacity", "0.5rem")).toThrow(/unitless numeric/);
		expect(() => backend.declare("width", "1em")).toThrow(/does not support the length unit/);
	});
});

describe("opentui border model", () => {
	test("the CSS border shorthand expands to border true + borderColor", () => {
		const backend = createOpentuiBackend();
		expect(backend.declare("border", "1px solid #3142c4")).toEqual({
			border: true,
			borderColor: "#3142c4",
		});
	});

	test("a shorthand without a color emits only the border flag", () => {
		const backend = createOpentuiBackend();
		expect(backend.declare("border", "solid")).toEqual({ border: true });
	});

	test("border width keywords do not become colors", () => {
		const backend = createOpentuiBackend();
		for (const value of ["thin solid", "medium dashed", "thick double"])
			expect(backend.declare("border", value)).toEqual({ border: true });
		expect(backend.declare("border", "thin solid red")).toEqual({
			border: true,
			borderColor: "red",
		});
	});

	test("disabled CSS borders stay disabled and functional colors stay intact", () => {
		const backend = createOpentuiBackend();
		for (const value of ["none", "hidden", "0", "0 solid red"])
			expect(backend.declare("border", value)).toEqual({ border: false });
		expect(backend.declare("border", "1px solid rgb(255, 0, 0)")).toEqual({
			border: true,
			borderColor: "rgb(255, 0, 0)",
		});
	});
});

describe("opentui refusal policy", () => {
	test("border radii are refused because OpenTUI has no radius field", () => {
		const backend = createOpentuiBackend();
		expect(() => backend.declare("borderRadius", "8px")).toThrow(
			/property "borderRadius" has no OpenTUI representation/,
		);
	});

	test("cascade/paint-only props throw", () => {
		const backend = createOpentuiBackend();
		for (const prop of ["boxShadow", "backdropFilter", "transitionDuration"]) {
			expect(() => backend.declare(prop, "1px")).toThrow(
				new RegExp(`"${prop}" has no OpenTUI representation`),
			);
		}
	});

	test("typography-shape props terminals own throw", () => {
		const backend = createOpentuiBackend();
		for (const prop of ["fontSize", "fontFamily", "letterSpacing"]) {
			expect(() => backend.declare(prop, "1px")).toThrow(
				new RegExp(`"${prop}" has no OpenTUI representation`),
			);
		}
	});

	test("unknown conditions throw (strict policy)", () => {
		const backend = createOpentuiBackend();
		expect(() => backend.declare("_hover__color", "red")).toThrow(/"_hover" is not supported/);
	});

	test("multi-word values on non-shorthand props refuse loudly", () => {
		const backend = createOpentuiBackend();
		expect(() => backend.declare("willChange", "transform background")).toThrow(
			/not representable/,
		);
	});
});

describe("yumcss/opentui surface", () => {
	test("design vocabulary resolves colors and lowers spacing to cells", () => {
		const dss = createDesignCss(examplePreset);
		const panel = dss({
			$frame: { fill: "$blue-500", pad: [4, 8] },
		});
		// Colors pass through; spacing quantizes to the nearest 4px cell.
		expect(panel).toEqual({
			backgroundColor: "#3182ce",
			paddingTop: 1,
			paddingRight: 2,
			paddingBottom: 1,
			paddingLeft: 2,
		});
	});

	test("_dark participates via the resolver; other conditions throw", () => {
		let dark = false;
		const dss = createDesignCss(examplePreset, { conditions: { dark: () => dark } });
		dark = false;
		expect(
			dss({ $frame: { fill: "$gray-100" }, _dark: { $frame: { fill: "$gray-800" } } }),
		).toEqual({
			backgroundColor: "#f3f4f6",
		});
		dark = true;
		expect(
			dss({ $frame: { fill: "$gray-100" }, _dark: { $frame: { fill: "$gray-800" } } }),
		).toEqual({
			backgroundColor: "#1f2937",
		});

		const strictDss = createDesignCss(examplePreset);
		expect(() =>
			strictDss({ $frame: { fill: "$gray-100" }, _hover: { $frame: { fill: "$gray-800" } } }),
		).toThrow(/"_hover" is not supported/);
	});

	test("identical styles resolve to the same reference; cx merges last-wins", () => {
		const dss = createDesignCss(examplePreset);
		const base = dss({ $frame: { fill: "$gray-100" } });
		expect(dss({ $frame: { fill: "$gray-100" } })).toBe(base);

		const cx = createCx();
		const merged = cx(base, dss({ $text: { color: "$red-500" } }));
		expect(merged).toEqual({ backgroundColor: "#f3f4f6", color: "#E53E3E" });
		expect(cx(base, dss({ $text: { color: "$red-500" } }))).toBe(merged);
	});
});
