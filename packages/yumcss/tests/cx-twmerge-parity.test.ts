/**
 * cx() ↔ tailwind-merge class-list parity — the acceptance harness for the
 * cx v2 merge engine (plans/007 item F).
 *
 * The inputs are the real class-list combinations from the
 * jantimon/css-in-js-bench yumcss lane (realistic-button, tabs,
 * product-grid, compose chains, dynamic values) plus targeted pairs for each
 * defect fixed in v2: multi-property partial survival, directional
 * font-size/line-height, and arbitrary-value disambiguation by value shape.
 *
 * Both engines must produce the exact same output string — same survivors,
 * same order.
 */
import { describe, expect, test } from "vitest";
import { twMerge } from "tailwind-merge";
import { createUnsafeCss } from "../src/unsafe/css.ts";
import { createCx } from "../src/cx/index.ts";
import { resolve } from "node:path";
import { readGeneratedTwConfig } from "./helpers/generated-tw.ts";

const real = readGeneratedTwConfig(resolve(import.meta.dirname, "../../../examples/example/src"));

const css = createUnsafeCss();
const cx = createCx({
	css,
	conflicts: real.conflicts,
	compose: real.compose,
	directionalConflicts: real.directionalConflicts,
});

// Verbatim inputs from the css-in-js-bench techs/yumcss lane cases.
const BTN_BASE =
	"relative flex w-full items-center justify-center text-center whitespace-nowrap cursor-pointer select-none " +
	"border border-solid rounded-[3px] text-[16px] leading-[24px] tracking-[0.01em] font-normal px-[15px] py-[7px] " +
	"min-[992px]:text-[14px] min-[992px]:leading-[20px] min-[992px]:px-[11px] min-[992px]:py-[1px] min-[992px]:inline-flex min-[992px]:w-auto " +
	"active:enabled:shadow-[0px_0px_2px_rgba(0,0,0,0.16),0px_2px_4px_rgba(0,0,0,0.08)] " +
	"before:content-[''] before:absolute before:inset-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:w-full before:h-full before:min-w-[24px] before:min-h-[24px]";
const BTN_STANDARD =
	"text-black bg-[#eee] border-[rgba(0,0,0,0.2)] hover:enabled:bg-[#ddd] focus-visible:enabled:bg-[#ddd]";
const BTN_PRIMARY =
	"text-white bg-[#444] border-[rgba(0,0,0,0.2)] hover:enabled:bg-black focus-visible:enabled:bg-black";
const BTN_DISABLED = "text-black/40 bg-transparent border-black/10 cursor-default";

const TAB_BASE =
	"relative inline-flex items-center cursor-pointer bg-transparent border-none h-[40px] " +
	"text-[16px] leading-[24px] tracking-[0.01em] font-normal min-[992px]:text-[14px] min-[992px]:leading-[20px] " +
	"text-[rgba(0,0,0,0.6)] " +
	"after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:border-b-[3px] after:border-solid after:border-b-transparent after:[transition:opacity_150ms_linear] " +
	"before:absolute before:content-[''] before:w-full before:min-w-[40px] before:top-0 before:bottom-0 before:h-full " +
	"focus-visible:outline-none focus-visible:after:border-b-[3px] focus-visible:after:border-solid focus-visible:after:border-b-[#007bc7]";
const TAB_ACTIVE =
	"text-[#000] supports-[anchor-name:--test]:[anchor-name:--active-tab] " +
	"after:border-b-[#eeb524] supports-[anchor-name:--test]:after:border-b-[#ddd] supports-[anchor-name:--test]:after:opacity-0";
const TAB_INACTIVE =
	"hover:enabled:text-[#000] hover:enabled:after:border-b-[#ddd] disabled:text-[rgba(0,0,0,0.26)] disabled:cursor-default";
const TABLIST =
	"relative whitespace-nowrap flex flex-nowrap overflow-x-auto gap-[24px] [box-shadow:inset_0_-1px_0_0_#ddd] m-0 p-0 list-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden " +
	"supports-[anchor-name:--test]:before:content-[''] supports-[anchor-name:--test]:before:absolute supports-[anchor-name:--test]:before:bottom-0 " +
	"supports-[anchor-name:--test]:before:[position-anchor:--active-tab] supports-[anchor-name:--test]:before:[left:anchor(left)] supports-[anchor-name:--test]:before:[right:anchor(right)] " +
	"supports-[anchor-name:--test]:before:h-[3px] supports-[anchor-name:--test]:before:bg-[#eeb524] supports-[anchor-name:--test]:before:[transition:left_150ms_ease-out,right_150ms_ease-out]";
const FULLWIDTH = "[&_li]:flex-1 [&_li]:flex [&_li]:justify-center [&_button]:flex-1";
const ITEM = "block m-0 p-0 w-min shrink-0 min-w-[40px]";

const TAP_TARGET =
	"before:content-[''] before:absolute before:inset-1/2 before:[translate:-50%_-50%] before:w-full before:h-full " +
	"[@media(hover:none)_and_(pointer:coarse)]:before:min-w-[44px] [@media(hover:none)_and_(pointer:coarse)]:before:min-h-[44px] " +
	"[@media(hover:hover)_and_(pointer:fine)]:before:min-w-[24px] [@media(hover:hover)_and_(pointer:fine)]:before:min-h-[24px]";
const FOCUS_RING =
	"focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:outline-offset-2";

/** Each entry mirrors one cn(...) call shape from a bench case. */
const BENCH_CASES: Array<{ name: string; args: Array<string | false> }> = [
	{ name: "realistic-button standard", args: [BTN_BASE, BTN_STANDARD] },
	{ name: "realistic-button primary+disabled", args: [BTN_BASE, BTN_PRIMARY, BTN_DISABLED] },
	{
		name: "compose-1 base+override",
		args: [
			"inline-flex items-center rounded-md px-4 py-2 bg-blue-600 text-white",
			"[border-left:1px_solid_hsl(53_70%_50%)] [padding-left:2px]",
		],
	},
	{
		name: "compose chain L3",
		args: [
			"inline-flex items-center rounded-md px-4 py-2 bg-blue-600 text-white",
			"[border-left:3px_solid_hsl(159_70%_50%)] [padding-left:6px]",
			"bg-red-600",
		],
	},
	{ name: "dyn-fair static", args: ["inline-block w-2 h-2"] },
	{
		name: "dyn-translate arbitrary transform",
		args: ["inline-block w-2 h-2", "[transform:translateX(12px)]"],
	},
	{
		name: "product-grid badge",
		args: [
			"absolute top-1.5 left-1.5 rounded px-1.5 py-0.5 text-xs leading-[normal] font-bold text-white",
			"bg-red-600",
		],
	},
	{ name: "product-grid tap target", args: [TAP_TARGET, FOCUS_RING, "relative block w-full"] },
	{ name: "tabs active", args: [TAB_BASE, TAB_ACTIVE] },
	{ name: "tabs inactive", args: [TAB_BASE, TAB_INACTIVE] },
	{ name: "tabs fullwidth list", args: [TABLIST, FULLWIDTH, ITEM] },
	{
		name: "btn-variant conditional stack",
		args: [
			"inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium bg-blue-600 text-white",
			"bg-gray-300 text-gray-500",
			false,
			"w-full",
		],
	},
];

describe("cx() matches tailwind-merge on the bench corpus", () => {
	for (const { name, args } of BENCH_CASES) {
		test(name, () => {
			const ours = cx(...args);
			const theirs = twMerge(...args.filter((a): a is string => typeof a === "string"));
			expect(ours).toBe(theirs);
		});
	}
});

describe("cx() matches tailwind-merge on targeted v2 defect pairs", () => {
	test("keeps parenthesized arbitrary values opaque", () => {
		expect(cx("border-x", "border-x-(--pattern-fg)")).toBe("border-x border-x-(--pattern-fg)");
	});
	const pairs: Array<Array<string>> = [
		["overflow-x-auto", "overflow-hidden"],
		["overflow-hidden", "overflow-x-auto"],
		["grow", "flex-1"],
		["flex-1", "grow"],
		["leading-tight", "text-sm"],
		["text-sm", "leading-tight"],
		["rounded-t", "rounded"],
		["rounded", "rounded-t"],
		["text-xs", "leading-tight"],
		["leading-tight", "text-xs"],
		["text-xs", "text-sm"],
		["p-6", "px-4"],
		["px-4", "p-6"],
		["border", "border-solid"],
		["border-2", "border"],
		["border", "border-2"],
		["border-solid", "border"],
		["border-[#eee]", "border-[3px]"],
		["border-b-black", "border-b-[#eeb524]"],
		["outline", "outline-2"],
		["transition", "duration-150"],
		["duration-150", "transition"],
		["text-[16px]", "text-[#000]"],
		["text-red-500", "text-[16px]"],
		["[padding-left:4px]", "[padding-left:8px]"],
		["px-4", "[padding-left:2px]"],
		["bg-red-500", "bg-[url(https://x/y.png)]"],
		["w-4", "w-[3.5rem]"],
	];
	test.each(pairs.map((args) => [args.join(" "), args]))("%s", (_label, args) => {
		expect(cx(...args)).toBe(twMerge(...args));
	});
});
