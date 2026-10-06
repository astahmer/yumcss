import { describe, expect, test } from "vitest";
import { resolve } from "node:path";
import { createUnsafeCss } from "../src/unsafe/css.ts";
import { createDesignCss } from "../src/design/index.ts";
import { createCx } from "../src/cx/index.ts";
import { examplePreset } from "@yumcss/example-preset";
import { tw } from "../../../examples/example/src/tw.ts";
import { readGeneratedTwConfig } from "./helpers/generated-tw.ts";

const real = readGeneratedTwConfig(resolve(import.meta.dirname, "../../../examples/example/src"));

const css = createUnsafeCss();
const dss = createDesignCss(examplePreset);

const cx = createCx({
	css,
	conflicts: real.conflicts,
	compose: real.compose,
	directionalConflicts: real.directionalConflicts,
});

const designCx = createCx({
	css: dss,
	conflicts: real.conflicts,
	compose: real.compose,
	directionalConflicts: real.directionalConflicts,
});

describe("tw class merging across calls", () => {
	test("later class wins per property", () => {
		expect(cx("bg-red-500", "bg-blue-500")).toBe("bg-blue-500");
		expect(cx("bg-blue-500", "bg-red-500")).toBe("bg-red-500");
		expect(cx("px-4", "p-6")).toBe("p-6");
		// twMerge ground truth: a later SUB-group (px) does not supersede the
		// earlier full-group p — p-6 survives on its uncovered top/bottom.
		expect(cx("p-6", "px-4")).toBe("p-6 px-4");
	});

	test("non-conflicting classes coexist", () => {
		expect(cx("bg-red-500", "border-2")).toBe("bg-red-500 border-2");
	});

	test("variant scoping keeps both", () => {
		expect(cx("p-4", "md:p-6")).toBe("p-4 md:p-6");
		// twMerge parity: within the md scope, px only covers left/right of
		// p-6, so md:p-6 survives on its top/bottom.
		expect(cx("p-4", "md:p-6", "md:px-2")).toBe("p-4 md:p-6 md:px-2");
	});

	test("same variant conflicts resolve last-wins", () => {
		expect(cx("hover:bg-red-500", "hover:bg-blue-500")).toBe("hover:bg-blue-500");
		// different scopes never merge
		expect(cx("hover:bg-red-500", "bg-blue-500")).toBe("hover:bg-red-500 bg-blue-500");
	});

	test("composing utilities coexist, same utility merges", () => {
		expect(cx("translate-x-1/2", "translate-y-1/2")).toBe("translate-x-1/2 translate-y-1/2");
		expect(cx("translate-x-1/2", "translate-x-full")).toBe("translate-x-full");
	});

	test("typed arbitrary values are never dropped", () => {
		expect(cx("bg-red-500", "bg-[url(https://x/y.png)]")).toBe(
			"bg-red-500 bg-[url(https://x/y.png)]",
		);
	});

	test("untyped arbitrary values merge like the utility default", () => {
		expect(cx("w-4", "w-[3.5rem]")).toBe("w-[3.5rem]");
		expect(cx("bg-red-500", "bg-[#fff]")).toBe("bg-[#fff]");
	});
});

describe("css atom merging", () => {
	test("same declaration across css APIs dedupes to one atom", () => {
		const fromClass = css.class({ color: "red" });
		const fromObject = css({ color: "red" });
		const fromGroup = css.group({ btn: { color: "red" } }).btn;
		expect(cx(fromClass, fromObject, fromGroup)).toBe(fromClass);
	});

	test("later declaration wins across css calls", () => {
		const a = css.class({ color: "red" });
		const b = css.class({ color: "blue" });
		expect(cx(a, b)).toBe(b);
		expect(cx(b, a)).toBe(a);
	});

	test("object form merges like the string form", () => {
		const a = css({ color: "red" });
		const b = css.class({ color: "blue" });
		expect(cx(a, b)).toBe(b);
	});
});

describe("cross-system merging (tw + css)", () => {
	test("tw color class and css color atom are one property", () => {
		const twColor = "text-gray-900";
		const cssColor = css.class({ color: "red" });
		expect(cx(twColor, cssColor)).toBe(cssColor);
		expect(cx(cssColor, twColor)).toBe(twColor);
	});

	test("design layer tokens merge against tw utilities", () => {
		const designColor = dss.class({ $text: { color: "$gray-900" } });
		expect(designCx("text-gray-900", designColor)).toBe(designColor);
		expect(designCx(designColor, "text-gray-900")).toBe("text-gray-900");
	});

	test("variant-scoped css conditions align with tw variants", () => {
		const hoverAtom = css.class({ _hover: { color: "red" } });
		expect(cx("hover:text-gray-900", hoverAtom)).toBe(hoverAtom);
		expect(cx(hoverAtom, "hover:text-gray-900")).toBe("hover:text-gray-900");
		// base and hover scopes never merge
		expect(cx("text-gray-900", hoverAtom)).toBe(`text-gray-900 ${hoverAtom}`);
	});

	test("tw() output merges through cx", () => {
		expect(cx(tw({ bg: "red-500" }), tw({ bg: "blue-500" }))).toBe("bg-blue-500");
	});
});

describe("fallbacks", () => {
	test("unknown classes are kept and exact duplicates dedupe", () => {
		expect(cx("foo-bar", "foo-bar", "baz")).toBe("foo-bar baz");
	});

	test("arrays and falsey values flatten", () => {
		expect(cx(false, ["flex", "bg-red-500"], null, undefined, "", "p-4")).toBe(
			"flex bg-red-500 p-4",
		);
	});

	test("repeated nested arrays are flattened each time they appear", () => {
		const shared: string[] = ["bg-red-500"];
		expect(cx([shared, "bg-blue-500", shared])).toBe("bg-red-500");
	});

	test("cx without conflicts keeps strings in order", () => {
		const plain = createCx({ css });
		const atom = css.class({ color: "red" });
		expect(plain("bg-red-500", "bg-blue-500", css.class({ color: "red" }))).toBe(
			`bg-red-500 bg-blue-500 ${atom}`,
		);
	});
});
