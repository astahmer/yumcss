/**
 * DTCG token groups -> Tailwind `@theme` bridge (generate-theme.ts) and its
 * wiring into the typegen pipeline (generate-types.ts).
 *
 * The contract under test:
 *
 * - only real Tailwind v4 theme namespaces are bridged; unknown groups are
 *   skipped, spacing is deliberately excluded;
 * - output is deterministic: sorted groups/names, normalized hex casing,
 *   byte-identical for identical inputs, "" when nothing bridges;
 * - `resolveTokenGroups` finds groups inside bare group objects, `{ tokens }`
 *   wrappers and full preset objects;
 * - injecting the block into typegen makes token-derived utilities appear in
 *   the generated value unions (`--color-brand-midnight` -> `bg-…-midnight`),
 *   while omitting it leaves generated output byte-identical to before.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
	buildThemeBlock,
	normalizeThemeValue,
	themeNamespaceFor,
	themeTokenName,
	themeVarsFromTokens,
} from "../src/tw/generate-theme.ts";
import { generateDesignSystem, resolveTokenGroups } from "../src/tw/generate-types.ts";

const app = resolve(import.meta.dirname, "../../../apps/example");
const srcDir = resolve(app, "src");
const css = readFileSync(resolve(srcDir, "tailwind.css"), "utf8");

describe("theme namespace mapping", () => {
	test("bridges flat and nested typography groups", () => {
		expect(themeNamespaceFor("colors")).toBe("color");
		expect(themeNamespaceFor("radii")).toBe("radius");
		expect(themeNamespaceFor("fontSizes")).toBe("text");
		expect(themeNamespaceFor("typography.fontSizes")).toBe("text");
		expect(themeNamespaceFor("letterSpacings")).toBe("tracking");
	});

	test("skips groups without a theme namespace", () => {
		expect(themeNamespaceFor("spacing")).toBeUndefined();
		expect(themeNamespaceFor("zIndex")).toBeUndefined();
	});
});

describe("token name + value canonicalization", () => {
	test("strips $ prefixes and sanitizes separators", () => {
		expect(themeTokenName("$blue-500")).toBe("blue-500");
		expect(themeTokenName("button.padding")).toBe("button-padding");
		expect(themeTokenName("whiteAlpha.100")).toBe("whiteAlpha-100");
	});

	test("hex values are lower-cased, others pass through", () => {
		expect(normalizeThemeValue("#E53E3E")).toBe("#e53e3e");
		expect(normalizeThemeValue("0.375rem")).toBe("0.375rem");
	});
});

describe("buildThemeBlock", () => {
	test("emits sorted vars across bridged groups incl. semantic tokens", () => {
		const block = buildThemeBlock({
			colors: { "$blue-500": "#3182CE", success: "#60A3BC" },
			radii: { md: "0.375rem" },
			spacing: { "4": "4px" }, // no namespace — must be skipped
			fontWeights: { semibold: "600" },
		});
		const lines = block.split("\n").slice(1, -1);
		expect(lines).toEqual([
			"\t--color-blue-500: #3182ce;",
			"\t--color-success: #60a3bc;",
			"\t--font-weight-semibold: 600;",
			"\t--radius-md: 0.375rem;",
		]);
	});

	test("is deterministic and empty when nothing bridges", () => {
		const groups = { colors: { a: "#111111" } };
		expect(buildThemeBlock(groups)).toBe(buildThemeBlock({ ...groups }));
		expect(buildThemeBlock({ spacing: { "4": "4px" } })).toBe("");
		expect(buildThemeBlock({})).toBe("");
	});

	test("themeVarsFromTokens skips empty and non-string values", () => {
		expect(
			themeVarsFromTokens({ colors: { keep: "#fff", drop: "", nested: { deep: "#000" } } }),
		).toEqual([{ name: "--color-keep", value: "#fff" }]);
	});
});

describe("resolveTokenGroups", () => {
	test("finds groups on .tokens of an exported preset object", () => {
		const preset = { strict: true, conditions: {}, tokens: { colors: { x: "#123123" } } };
		expect(resolveTokenGroups({ examplePreset: preset })).toEqual(preset.tokens);
	});

	test("accepts a default-exported bare groups object", () => {
		const groups = { colors: { x: "#123123" } };
		expect(resolveTokenGroups({ default: groups })).toEqual(groups);
	});

	test("returns undefined when nothing is bridgeable", () => {
		expect(resolveTokenGroups({ somethingElse: { foo: "bar" } })).toBeUndefined();
	});
});

describe("typegen integration", () => {
	const THEME_BLOCK = buildThemeBlock({
		colors: { "brand-midnight": "#1a1f36" },
	});

	test("injected @theme makes token-derived utilities part of the unions", async () => {
		const cssWithTheme = `${css}`;
		const { typesDts } = await generateDesignSystem(cssWithTheme, srcDir, {
			themeBlock: THEME_BLOCK,
		});
		expect(typesDts).toContain("midnight");
	});

	test("no theme block = unchanged generated output", async () => {
		const without = await generateDesignSystem(css, srcDir);
		const explicitEmpty = await generateDesignSystem(css, srcDir, { themeBlock: "" });
		expect(explicitEmpty.typesDts).toBe(without.typesDts);
		expect(explicitEmpty.twTs).toBe(without.twTs);
	});

	test("generation with the same injected block is byte-deterministic", async () => {
		const a = await generateDesignSystem(css, srcDir, { themeBlock: THEME_BLOCK });
		const b = await generateDesignSystem(css, srcDir, { themeBlock: THEME_BLOCK });
		expect(a.typesDts).toBe(b.typesDts);
		expect(a.twTs).toBe(b.twTs);
	});
});
