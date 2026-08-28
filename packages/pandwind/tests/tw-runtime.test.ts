import { describe, expect, test } from "vitest";
import { createTw, tw } from "../src/tw/runtime.ts";

const typed = createTw<Record<string, unknown>>({
	variants: {
		group: { join: "-" },
		peer: { join: "-" },
		not: { join: "-" },
		max: { join: "-" },
		aria: { join: "-" },
		data: { join: "-" },
		"@": { join: "" },
	},
});

const merged = createTw<Record<string, unknown>>({
	conflicts: {
		p: {
			"*": ["padding-top", "padding-right", "padding-bottom", "padding-left"],
		},
		px: { "*": ["padding-left", "padding-right"] },
		bg: {
			"*": ["background-color"],
			"blend-normal": ["background-blend-mode"],
		},
		text: {
			"*": ["font-size", "line-height"],
			"gray-900": ["color"],
			center: ["text-align"],
		},
		border: {
			"*": ["border-style", "border-width"],
			"red-500": ["border-color"],
			collapse: ["border-collapse"],
		},
		opacity: { "*": ["opacity"] },
		ring: { "*": ["ring-shadow"] },
		"inset-ring": { "*": ["inset-ring-shadow"] },
	},
});

const composed = createTw<Record<string, unknown>>({
	conflicts: {
		"scale-x": { "*": ["scale"] },
		"scale-y": { "*": ["scale"] },
		"translate-x": { "*": ["translate"] },
		"translate-y": { "*": ["translate"] },
		bg: { "*": ["background-color"] },
	},
	compose: ["scale-x", "scale-y", "translate-x", "translate-y"],
});

describe("tw utilities", () => {
	test("plain utilities", () => {
		expect(tw({ bg: "sky-600" })).toBe("bg-sky-600");
		expect(tw({ py: "6" })).toBe("py-6");
		expect(tw({ minH: "screen" })).toBe("min-h-screen");
		expect(tw({ gridCols: "2" })).toBe("grid-cols-2");
	});

	test("boolean utilities", () => {
		expect(tw({ relative: true })).toBe("relative");
		expect(tw({ relative: false })).toBe("");
		expect(tw({ srOnly: true })).toBe("sr-only");
	});

	test("array values emit multiple classes", () => {
		expect(tw({ ring: ["1", "gray-900/5"] })).toBe("ring-1 ring-gray-900/5");
		expect(tw({ outline: ["2", "sky-600"] })).toBe("outline-2 outline-sky-600");
	});

	test("negative utilities", () => {
		expect(tw({ "-translateX": "1/2" })).toBe("-translate-x-1/2");
		expect(tw({ "-top": "4" })).toBe("-top-4");
	});

	test("opacity modifiers and arbitrary values pass through", () => {
		expect(tw({ bg: "gray-900/5" })).toBe("bg-gray-900/5");
		expect(tw({ bg: "[url(/img/grid.svg)]" })).toBe("bg-[url(/img/grid.svg)]");
		expect(tw({ w: "[3.5rem]" })).toBe("w-[3.5rem]");
	});

	test("compound base utilities", () => {
		expect(tw({ flex: "col" })).toBe("flex flex-col");
		expect(tw({ flex: "1" })).toBe("flex-1");
		expect(tw({ sm: { flex: "row" } })).toBe("sm:flex sm:flex-row");
	});
});

describe("tw variants", () => {
	test("simple nesting", () => {
		expect(tw({ sm: { py: "12" } })).toBe("sm:py-12");
		expect(tw({ hover: { bg: "sky-700" } })).toBe("hover:bg-sky-700");
		expect(tw({ dark: { hover: { bg: "sky-700" } } })).toBe("dark:hover:bg-sky-700");
	});

	test("dash-joined variants", () => {
		expect(typed({ group: { hover: { opacity: "100" } } })).toBe("group-hover:opacity-100");
		expect(typed({ max: { md: { bg: "red-500" } } })).toBe("max-md:bg-red-500");
		expect(typed({ aria: { checked: { bg: "sky-600" } } })).toBe("aria-checked:bg-sky-600");
		expect(typed({ data: { "[state=open]": { bg: "sky-600" } } })).toBe(
			"data-[state=open]:bg-sky-600",
		);
	});

	test("empty-joined container variant", () => {
		expect(typed({ "@": { md: { hover: { bg: "red-500" } } } })).toBe("@md:hover:bg-red-500");
	});

	test("camelCase variant names", () => {
		expect(tw({ focusVisible: { outline: ["2", "sky-600"], outlineOffset: "2" } })).toBe(
			"focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2",
		);
		expect(tw({ motionReduce: { transition: "none" } })).toBe("motion-reduce:transition-none");
	});

	test("modifier-requiring variants reject direct utilities", () => {
		expect(() => typed({ group: { bg: "red-500" } })).toThrow(/requires a nested variant/);
	});
});

describe("tw semantic sub-keys (overloaded utilities)", () => {
	test("sub-keys resolve onto the base utility's classes", () => {
		expect(tw({ textSize: "2xl" })).toBe("text-2xl");
		expect(tw({ textColor: "gray-900" })).toBe("text-gray-900");
		expect(tw({ textAlign: "center" })).toBe("text-center");
		expect(tw({ textWrap: "balance" })).toBe("text-balance");
		expect(tw({ textOverflow: "ellipsis" })).toBe("text-ellipsis");
	});

	test("disjoint concerns compose without arrays", () => {
		expect(tw({ textSize: "2xl", textColor: "gray-900", textAlign: "center" })).toBe(
			"text-2xl text-gray-900 text-center",
		);
	});

	test("sub-keys work under variant nesting and with arrays/modifiers", () => {
		expect(typed({ group: { hover: { textColor: "sky-600" } } })).toBe("group-hover:text-sky-600");
		expect(tw({ textColor: ["gray-900/50", "red-500"] })).toBe("text-gray-900/50 text-red-500");
	});

	test("same-concern conflicts merge last-wins through the base's map", () => {
		// both spellings set font-size -> later wins, whichever spelling is later
		expect(merged({ text: "sm", textSize: "lg" })).toBe("text-lg");
		expect(merged({ textSize: "lg", text: "sm" })).toBe("text-sm");
		// size vs color are disjoint -> coexist in both orders
		expect(merged({ textSize: "lg", textColor: "gray-900" })).toBe("text-lg text-gray-900");
		expect(merged({ textColor: "gray-900", textSize: "lg" })).toBe("text-gray-900 text-lg");
	});

	test("legacy overloaded spelling is untouched", () => {
		expect(tw({ text: "2xl" })).toBe("text-2xl");
		expect(tw({ text: "center" })).toBe("text-center");
		expect(tw({ text: ["2xl", "gray-900"] })).toBe("text-2xl text-gray-900");
	});
});

describe("tw last-wins merging", () => {
	test("later keys drop earlier conflicting utilities", () => {
		expect(merged({ px: "4", p: "6" })).toBe("p-6");
		expect(merged({ p: "6", px: "4" })).toBe("p-6 px-4");
		expect(merged({ p: "6", pb: "10" })).toBe("p-6 pb-10");
		expect(merged({ ring: true, insetRing: true })).toBe("ring inset-ring");
		expect(merged({ bg: "red-500", border: "2" })).toBe("bg-red-500 border-2");
	});

	test("overloaded utilities keep non-conflicting values", () => {
		expect(merged({ text: ["2xl", "gray-900", "center"] })).toBe(
			"text-2xl text-gray-900 text-center",
		);
		expect(merged({ border: ["2", "red-500", "collapse"] })).toBe(
			"border-2 border-red-500 border-collapse",
		);
	});

	test("conflicting values inside one array collapse to the last", () => {
		expect(merged({ bg: ["red-500", "blue-500"] })).toBe("bg-blue-500");
	});

	test("variant-scoped utilities do not conflict with base utilities", () => {
		expect(merged({ p: "4", md: { p: "6" } })).toBe("p-4 md:p-6");
		expect(merged({ md: { p: "6" }, p: "4" })).toBe("md:p-6 p-4");
	});

	test("unknown values fall back to the utility default", () => {
		expect(merged({ p: "6", px: "bogus" })).toBe("p-6 px-bogus");
	});

	test("no conflicts meta means no merging", () => {
		expect(tw({ px: "4", p: "6" })).toBe("px-4 p-6");
	});

	test("composing utilities coexist across keys, merge within a key", () => {
		expect(composed({ scaleX: "2", scaleY: "2" })).toBe("scale-x-2 scale-y-2");
		expect(composed({ translateX: "4", translateY: "2" })).toBe("translate-x-4 translate-y-2");
		expect(composed({ scaleX: ["2", "4"] })).toBe("scale-x-4");
		expect(composed({ bg: ["red-500", "blue-500"] })).toBe("bg-blue-500");
	});
});

describe("tw semantic sub-keys — bg / border / outline / decoration families", () => {
	test("bg family sub-keys resolve onto bg-* classes", () => {
		expect(tw({ bgColor: "red-500" })).toBe("bg-red-500");
		expect(tw({ bgImage: "gradient-to-t" })).toBe("bg-gradient-to-t");
		expect(tw({ bgSize: "cover" })).toBe("bg-cover");
		expect(tw({ bgPosition: "center" })).toBe("bg-center");
		expect(tw({ bgRepeat: "no-repeat" })).toBe("bg-no-repeat");
		expect(tw({ bgAttachment: "fixed" })).toBe("bg-fixed");
	});

	test("border family sub-keys resolve onto border-* classes", () => {
		expect(tw({ borderColor: "red-500" })).toBe("border-red-500");
		expect(tw({ borderWidth: "2" })).toBe("border-2");
		expect(tw({ borderStyle: "dashed" })).toBe("border-dashed");
	});

	test("outline family sub-keys resolve onto outline-* classes", () => {
		expect(tw({ outlineColor: "red-500" })).toBe("outline-red-500");
		expect(tw({ outlineWidth: "2" })).toBe("outline-2");
		expect(tw({ outlineStyle: "dashed" })).toBe("outline-dashed");
	});

	test("decoration family sub-keys resolve onto decoration-* classes", () => {
		expect(tw({ decorationColor: "red-500" })).toBe("decoration-red-500");
		expect(tw({ decorationStyle: "dashed" })).toBe("decoration-dashed");
		expect(tw({ decorationThickness: "4" })).toBe("decoration-4");
	});

	test("disjoint concerns within one family compose", () => {
		expect(tw({ bgColor: "red-500", bgSize: "cover", bgRepeat: "no-repeat" })).toBe(
			"bg-red-500 bg-cover bg-no-repeat",
		);
		expect(tw({ borderWidth: "2", borderColor: "red-500", borderStyle: "solid" })).toBe(
			"border-2 border-red-500 border-solid",
		);
	});

	test("base vs sub-key merges last-wins through the base's map", () => {
		expect(merged({ bg: "red-500", bgColor: "blue-500" })).toBe("bg-blue-500");
		expect(merged({ bgColor: "blue-500", bg: "red-500" })).toBe("bg-red-500");
		// width (style+width signature) vs color are disjoint -> coexist
		expect(merged({ borderWidth: "2", borderColor: "red-500" })).toBe("border-2 border-red-500");
		expect(merged({ borderColor: "red-500", borderWidth: "2" })).toBe("border-red-500 border-2");
	});

	test("sub-keys work under variant nesting and with arrays/modifiers", () => {
		expect(typed({ group: { hover: { bgColor: "sky-600" } } })).toBe("group-hover:bg-sky-600");
		expect(tw({ borderColor: ["red-500/50", "blue-500"] })).toBe(
			"border-red-500/50 border-blue-500",
		);
	});

	test("legacy overloaded spellings stay untouched", () => {
		expect(tw({ bg: "cover" })).toBe("bg-cover");
		expect(tw({ bg: ["red-500", "no-repeat"] })).toBe("bg-red-500 bg-no-repeat");
		expect(tw({ border: "2" })).toBe("border-2");
	});
});
