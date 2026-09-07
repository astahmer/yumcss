/**
 * Tailwind adapter — the "same class from css() and tw()" proof.
 *
 * The adapter lets the css() engine emit literal Tailwind utilities instead
 * of hashed atoms: `css({ color: "$blue-500" })` and
 * `tw({ text: "blue-500" })` produce the *identical* class string, so
 * Tailwind compiles the CSS exactly once and the stylesheet cannot grow no
 * matter how much of the app is written with css() vs tw().
 *
 * The @theme below mirrors the example preset's tokens (hex values, rem
 * radii) — that alignment is the token -> utility bridge: when a preset
 * token equals a theme value, the bridge yields the short utility; when it
 * doesn't, the adapter falls back to an arbitrary property class, which is
 * still real Tailwind CSS.
 */
import { describe, expect, test } from "vitest";
import { createCx } from "../src/cx/index.ts";
import { createCss } from "../src/css/index.ts";
import { createDesignCss } from "../src/design/index.ts";
import { examplePreset } from "@pandwind/example-preset";
import { createTwAdapter } from "../src/tw/adapter.ts";
import { generateUtilityBridge } from "../src/tw/bridge.ts";
import { compileStyles } from "../src/tw/compile.ts";
import { generateDesignSystem } from "../src/tw/generate-types.ts";
import { extractTwConfig } from "../src/vite/inline.ts";
import { compileClasses, rulesForClass } from "./helpers/tailwind-proof.ts";

const BASE = import.meta.dirname;

/** @theme mirroring the example preset tokens used in these tests. */
const THEME_ENTRY = `
@import "tailwindcss";
@theme {
  --color-white: #ffffff;
  --color-gray-900: #111827;
  --color-gray-600: #4b5563;
  --color-blue-500: #3182ce;
  --color-blue-400: #4299e1;
  --color-blue-600: #2b6cb0;
  --color-blue-700: #2c5282;
  --color-red-500: #E53E3E;
  --spacing-card: 1.25rem;
  --radius-md: 0.375rem;
  --radius-xl: 0.75rem;
  --text-sm: 0.875rem;
}
`;

async function setUp() {
	const bridge = await generateUtilityBridge(THEME_ENTRY, BASE);
	const { twTs } = await generateDesignSystem(THEME_ENTRY, BASE);
	const config = extractTwConfig(twTs)!;
	const adapter = createTwAdapter({ preset: examplePreset, variants: config.variants, bridge });
	const css = createCss({ className: adapter });
	const design = createDesignCss(examplePreset, { className: adapter });
	const cx = createCx({
		css,
		variants: config.variants,
		conflicts: config.conflicts,
		compose: config.compose,
	});
	const tw = (styles: Parameters<typeof compileStyles>[0]) =>
		compileStyles(styles, config.variants, config.conflicts, config.compose);
	return { bridge, config, adapter, css, design, cx, tw };
}

describe("the tailwind adapter", () => {
	test("setup generates a bridge with the expected entries", async () => {
		const s = await setUp();
		expect(s.bridge.color?.["#3182ce"]).toBe("text-blue-500");
		expect(s.bridge["background-color"]?.["#E53E3E"]).toBe("bg-red-500");
		expect(s.bridge["border-radius"]?.["0.375rem"]).toBe("rounded-md");
		expect(s.bridge["border-radius"]?.["0.75rem"]).toBe("rounded-xl");
		expect(s.bridge.padding?.["1rem"]).toBe("p-4");
		expect(s.bridge.padding?.["1.25rem"]).toBe("p-card");
		expect(s.bridge.display?.flex).toBe("flex");
		expect(s.bridge["font-size"]?.["0.875rem"]).toBe("text-sm");
	});

	test("css() emits the exact same class as tw() for the same intent", async () => {
		const s = await setUp();
		expect(s.css.class({ color: "$blue-500" })).toBe("text-blue-500");
		expect(s.tw({ text: "blue-500" })).toBe("text-blue-500");

		expect(s.css.class({ backgroundColor: "$red-500" })).toBe("bg-red-500");
		expect(s.tw({ bg: "red-500" })).toBe("bg-red-500");

		expect(s.css.class({ borderRadius: "md" })).toBe("rounded-md");
		expect(s.tw({ rounded: "md" })).toBe("rounded-md");

		expect(s.css.class({ display: "flex" })).toBe("flex");
		expect(s.tw({ flex: true })).toBe("flex");
	});

	test("design css() surfaces map to the same utilities", async () => {
		const s = await setUp();
		expect(s.design.class({ $text: { color: "$blue-500" } })).toBe("text-blue-500");
		expect(s.design.class({ $frame: { corners: "xl", fill: "$blue-600" } })).toBe(
			"rounded-xl bg-blue-600",
		);
		expect(s.design.class({ $text: { size: "sm", color: "$gray-900" } })).toBe(
			"text-gray-900 text-sm",
		);
	});

	test("conditions become the same variants tw() uses", async () => {
		const s = await setUp();
		expect(s.css.class({ _hover: { color: "$blue-400" } })).toBe("hover:text-blue-400");
		expect(s.tw({ hover: { text: "blue-400" } })).toBe("hover:text-blue-400");

		expect(s.css.class({ sm: { color: "$blue-500" } })).toBe("sm:text-blue-500");
		expect(s.tw({ sm: { text: "blue-500" } })).toBe("sm:text-blue-500");

		expect(s.css.class({ group: { hover: { color: "$blue-500" } } })).toBe(
			"group-hover:text-blue-500",
		);
		expect(s.tw({ group: { hover: { text: "blue-500" } } })).toBe("group-hover:text-blue-500");
	});

	test("values without a bridge entry fall back to arbitrary property classes", async () => {
		const s = await setUp();
		// 3.5rem folds to calc(var(--spacing) * 14) -> the short `w-14`.
		expect(s.css.class({ width: "3.5rem" })).toBe("w-14");
		expect(s.css.class({ width: "13px" })).toBe("[width:13px]");
		expect(s.css.class({ marginTop: "7px" })).toBe("[margin-top:7px]");
		expect(s.css.class({ opacity: 0.5 } as never)).toBe("[opacity:0.5]");
	});

	test("every emitted class compiles in real Tailwind", async () => {
		const classes = [
			"text-blue-500",
			"bg-red-500",
			"rounded-md",
			"flex",
			"w-[3.5rem]",
			"[margin-top:8px]",
			"hover:text-blue-400",
			"sm:text-blue-500",
			"group-hover:text-blue-500",
			"text-sm",
			"text-gray-900",
		];
		const { root } = await compileClasses(THEME_ENTRY, classes);
		for (const cls of classes) {
			expect(rulesForClass(root, cls).length, `${cls} should compile`).toBeGreaterThan(0);
		}
	});

	test("cx() still merges last-wins on adapter output", async () => {
		const s = await setUp();
		const merged = s.cx(
			s.tw({ bg: "red-500", p: "4" }),
			s.css.class({ backgroundColor: "$blue-500" }),
			"px-2",
		);
		expect(merged).toContain("bg-blue-500");
		expect(merged).not.toContain("bg-red-500");
		// cx v2 twMerge parity: later px-2 only covers left/right of p-4.
		expect(merged).toContain("p-4");
		expect(merged).toContain("px-2");
	});

	test("mixing css() and tw() cannot grow the stylesheet: same class, one rule", async () => {
		const s = await setUp();
		const cssClasses = s.css.class({
			color: "$blue-500",
			backgroundColor: "$red-500",
			borderRadius: "xl",
			_hover: { color: "$blue-400" },
		});
		const twClasses = s.tw({
			text: "blue-500",
			bg: "red-500",
			rounded: "xl",
			hover: { text: "blue-400" },
		});

		// The whole point: both APIs emit the identical class string, so the
		// app ships one class list and Tailwind compiles each rule once.
		expect(cssClasses).toBe(twClasses);
		expect(cssClasses.split(" ").toSorted()).toEqual(
			["text-blue-500", "bg-red-500", "rounded-xl", "hover:text-blue-400"].toSorted(),
		);

		const { root } = await compileClasses(THEME_ENTRY, cssClasses.split(" "));
		const emitted = new Map<string, number>();
		root.walkRules((rule) => {
			for (const cls of cssClasses.split(" ")) {
				if (rule.selector.includes(cls.replace(/:/g, "\\:"))) {
					emitted.set(cls, (emitted.get(cls) ?? 0) + 1);
				}
			}
		});
		for (const cls of cssClasses.split(" ")) {
			expect(emitted.get(cls), `${cls} should compile to exactly one rule`).toBe(1);
		}
	});

	test("unrepresentable declarations fail loudly, never silently drop CSS", async () => {
		const s = await setUp();
		// Unknown condition: a clear error, not a CSS-less hashed class.
		expect(() => s.css.class({ madeUpCondition: { color: "$blue-500" } } as never)).toThrow(
			/cannot map|no Tailwind variant/,
		);
		// `$input` dynamics need the atomic engine's runtime stylesheet.
		expect(() => s.css.class({ color: "input>$color" } as never)).toThrow(/does not support/);
		// Unknown values still produce a valid class (arbitrary fallback).
		expect(() => s.css.class({ color: "not-a-color" } as never)).not.toThrow();
	});
});
