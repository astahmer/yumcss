/**
 * Type-level contract of the `pandwind/opentui` surface — the opentui
 * twin of backends-rn-typings.tst.ts. Same typed design vocabulary, same
 * strictness; plus the declared-with-default unit policy option
 * (`cellSize`) on the surface entry point.
 */
import { expect, test } from "tstyche";
import { createCx, createDesignCss } from "../src/opentui.ts";
import { examplePreset } from "@pandwind/example-preset";

const dss = createDesignCss(examplePreset);

test("design dss() accepts the three modules with token values", () => {
	expect(dss).type.toBeCallableWith({
		$frame: {
			fill: "$green-500",
			corners: "md",
			pad: 2,
		},
		$layout: { align: "center", gap: 1 },
		$text: { size: "sm", color: "$gray-700" },
	});
});

test("unknown tokens are a type error", () => {
	// @ts-expect-error is not assignable to type
	dss({ $frame: { fill: "$nope" } });
});

test("unknown module props are a type error", () => {
	// @ts-expect-error may only specify known properties
	dss({ $frame: { shadow: "big" } });
});

test("conditions stay recursively typed (_dark nests modules)", () => {
	expect(dss).type.toBeCallableWith({ _dark: { $frame: { fill: "$gray-800" } } });
});

test("surface options accept cellSize and condition resolver maps", () => {
	expect(createDesignCss(examplePreset, { cellSize: 8 })).type.toBeCallableWith();
	expect(
		createDesignCss(examplePreset, { conditions: { dark: () => false }, cellSize: 2 }),
	).type.toBeCallableWith();
});

test("the resolved artifact is a plain structurally-typed style object", () => {
	expect(dss({ $frame: { fill: "$gray-100" } })).type.toBeAssignableTo<Record<string, unknown>>();
});

test("cx merges style objects, arrays and falsy skips", () => {
	const cx = createCx();
	const box = dss({ $frame: { fill: "$gray-100" } });
	expect(cx(box, [box], undefined, null, false)).type.toBeAssignableTo<Record<string, unknown>>();
});
