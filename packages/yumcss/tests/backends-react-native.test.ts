/**
 * React Native backend + `yumcss/react-native` surface (plans/021 step 3).
 *
 * Pins what is RN-specific on top of the shared object skeleton:
 *
 * - value policy: px/rem lengths become unitless dp numbers, enum-ish
 *   props keep their strings, CSS-only props throw;
 * - shorthand expansion: padding/margin/borderWidth lists split per side,
 *   borderRadius lists split per corner (CSS diagonal pairing);
 * - the design vocabulary (`createDesignCss`) resolves preset tokens and
 *   lowers to RN style objects; `_dark` follows the resolver, other
 *   conditions throw; identical styles keep stable identity.
 */
import { describe, expect, test } from "vitest";
import { createRnBackend } from "../src/backends/react-native.ts";
import { createDesignCss, createCx } from "../src/rn.ts";
import { examplePreset } from "@yumcss/example-preset";

describe("rn value/unit policy", () => {
	test("lengths become unitless numbers (px verbatim, rem x16, negatives ok)", () => {
		const backend = createRnBackend();
		expect(backend.declare("width", "20px")).toEqual({ width: 20 });
		expect(backend.declare("width", "0.5rem")).toEqual({ width: 8 });
		expect(backend.declare("width", ".5rem")).toEqual({ width: 8 });
		expect(backend.declare("top", "-4px")).toEqual({ top: -4 });
	});

	test("rejects CSS units React Native cannot represent", () => {
		const backend = createRnBackend();
		expect(() => backend.declare("width", "1em")).toThrow(/does not support the length unit/);
		expect(() => backend.declare("color", "1rem")).toThrow(/not representable/);
	});

	test("non-numeric values pass through as strings", () => {
		const backend = createRnBackend();
		expect(backend.declare("flexDirection", "row")).toEqual({ flexDirection: "row" });
	});

	test("enum-ish numeric-looking props stay strings", () => {
		const backend = createRnBackend();
		expect(backend.declare("fontWeight", "600")).toEqual({ fontWeight: "600" });
	});

	test("CSS-only props throw", () => {
		const backend = createRnBackend();
		for (const prop of ["backdropFilter", "boxShadow", "gridTemplateColumns"]) {
			expect(() => backend.declare(prop, "1px")).toThrow(
				new RegExp(`"${prop}" has no React Native representation`),
			);
		}
	});

	test("unconvertible multi-values throw", () => {
		const backend = createRnBackend();
		expect(() => backend.declare("willChange", "transform background")).toThrow(
			/not representable/,
		);
	});
});

describe("rn shorthand expansion", () => {
	test("single-value shorthands keep the compact RN prop", () => {
		const backend = createRnBackend();
		expect(backend.declare("padding", "4")).toEqual({ padding: 4 });
		expect(backend.declare("borderRadius", "0.5rem")).toEqual({ borderRadius: 8 });
	});

	test("2/3/4-value lists split per side (CSS T-R-B-L order)", () => {
		const backend = createRnBackend();
		expect(backend.declare("padding", "4px 8px")).toEqual({
			paddingTop: 4,
			paddingRight: 8,
			paddingBottom: 4,
			paddingLeft: 8,
		});
		expect(backend.declare("margin", "2px 4px 6px")).toEqual({
			marginTop: 2,
			marginRight: 4,
			marginBottom: 6,
			marginLeft: 4,
		});
		expect(backend.declare("borderWidth", "1px 2px 3px 4px")).toEqual({
			borderTopWidth: 1,
			borderRightWidth: 2,
			borderBottomWidth: 3,
			borderLeftWidth: 4,
		});
	});

	test("radius lists pair diagonally per corner (TL TR BR BL)", () => {
		const backend = createRnBackend();
		expect(backend.declare("borderRadius", "4px 8px")).toEqual({
			borderTopLeftRadius: 4,
			borderTopRightRadius: 8,
			borderBottomRightRadius: 4,
			borderBottomLeftRadius: 8,
		});
	});

	test("lists outside the CSS grammar refuse loudly", () => {
		const backend = createRnBackend();
		expect(() => backend.declare("color", "red blue")).toThrow(/not representable/);
		expect(() => backend.declare("opacity", "1px 2px")).toThrow(/not representable/);
	});
});

describe("yumcss/react-native surface", () => {
	test("design vocabulary resolves tokens and lowers to RN style objects", () => {
		const dss = createDesignCss(examplePreset);
		const card = dss({
			$frame: { fill: "$blue-500", corners: "lg", pad: [4, 8] },
		});
		expect(card).toEqual({
			backgroundColor: "#3182ce",
			borderRadius: 8,
			paddingTop: 4,
			paddingRight: 8,
			paddingBottom: 4,
			paddingLeft: 8,
		});
	});

	test("_dark participates via the resolver; other conditions throw", () => {
		let dark = false;
		const dss = createDesignCss(examplePreset, { conditions: { dark: () => dark } });
		// Inline literals stay contextually typed (token-key checked).
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
