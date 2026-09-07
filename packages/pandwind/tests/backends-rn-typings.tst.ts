/**
 * Type-level contract of the `pandwind/react-native` surface — mirrors
 * design-typings.tst.ts for the object-backend world. Pins that the RN
 * subpath inherits the design layer's typed vocabulary verbatim: same
 * token-constrained modules, same recursive-condition typing, same
 * "wrong is a type error" rules — only the OUTPUT shape differs (a plain
 * structurally-typed style object instead of a class string).
 */
import { expect, test } from "tstyche";
import { createCx, createDesignCss } from "../src/rn.ts";
import { examplePreset } from "@pandwind/example-preset";

const css = createDesignCss(examplePreset);

test("design css() accepts the three modules with token values", () => {
	expect(css).type.toBeCallableWith({
		$frame: {
			fill: "$blue-500",
			corners: "lg",
			pad: [4, 8],
		},
		$layout: { align: "center", gap: 8 },
		$text: { size: "sm", color: "$gray-700" },
	});
});

test("unknown tokens are a type error", () => {
	// @ts-expect-error is not assignable to type
	css({ $frame: { fill: "$not-a-token" } });
});

test("unknown module props are a type error", () => {
	// @ts-expect-error may only specify known properties
	css({ $frame: { nope: 1 } });
});

test("unknown module keys are a type error", () => {
	// @ts-expect-error may only specify known properties
	css({ $bogus: { w: 10 } });
});

test("conditions stay recursively typed (_dark nests modules)", () => {
	expect(css).type.toBeCallableWith({ _dark: { $frame: { fill: "$gray-900" } } });
});

test("surface options accept condition resolver maps", () => {
	expect(createDesignCss(examplePreset)).type.toBeCallableWith();
	expect(
		createDesignCss(examplePreset, { conditions: { dark: () => true } }),
	).type.toBeCallableWith();
});

test("the resolved artifact is a plain structurally-typed style object", () => {
	expect(css({ $frame: { fill: "$gray-100" } })).type.toBeAssignableTo<Record<string, unknown>>();
});

test("cx merges style objects, arrays and falsy skips", () => {
	const cx = createCx();
	const card = css({ $frame: { fill: "$gray-100" } });
	expect(cx(card, [card], undefined, null, false)).type.toBeAssignableTo<Record<string, unknown>>();
});
