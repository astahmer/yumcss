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
		expect(tw({ dark: { hover: { bg: "sky-700" } } })).toBe(
			"dark:hover:bg-sky-700",
		);
	});

	test("dash-joined variants", () => {
		expect(typed({ group: { hover: { opacity: "100" } } })).toBe(
			"group-hover:opacity-100",
		);
		expect(typed({ max: { md: { bg: "red-500" } } })).toBe("max-md:bg-red-500");
		expect(typed({ aria: { checked: { bg: "sky-600" } } })).toBe(
			"aria-checked:bg-sky-600",
		);
		expect(typed({ data: { "[state=open]": { bg: "sky-600" } } })).toBe(
			"data-[state=open]:bg-sky-600",
		);
	});

	test("empty-joined container variant", () => {
		expect(typed({ "@": { md: { hover: { bg: "red-500" } } } })).toBe(
			"@md:hover:bg-red-500",
		);
	});

	test("camelCase variant names", () => {
		expect(
			tw({ focusVisible: { outline: ["2", "sky-600"], outlineOffset: "2" } }),
		).toBe(
			"focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:outline-offset-2",
		);
		expect(tw({ motionReduce: { transition: "none" } })).toBe(
			"motion-reduce:transition-none",
		);
	});

	test("modifier-requiring variants reject direct utilities", () => {
		expect(() => typed({ group: { bg: "red-500" } })).toThrow(
			/requires a nested variant/,
		);
	});
});
