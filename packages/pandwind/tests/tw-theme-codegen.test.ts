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
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";
import {
	buildThemeBlock,
	createConditionResolver,
	normalizeThemeValue,
	themeNamespaceFor,
	themeTokenName,
	themeVarsFromTokens,
} from "../src/tw/generate-theme.ts";
import {
	generateDesignSystem,
	resolvePresetConditions,
	resolveTokenGroups,
} from "../src/tw/generate-types.ts";

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

describe("condition-bound semantic tokens (probed against real tailwindcss 4.3.3)", () => {
	// Probe results backing these expectations (plan 010 section D):
	// - nesting @theme inside .dark silently flattens to :root — never emit;
	// - plain-CSS custom-property overrides cascade into var()-based
	//   utilities for selector, media AND compound (media + pseudo)
	//   conditions — verified through the real compiler.

	const CONDITIONS = {
		dark: ".dark &",
		sm: "@media (min-width: 640px)",
		hover: "&:hover",
		supportHover: ["@media (hover: hover) and (pointer: fine)", "&:hover"],
	};
	const resolver = createConditionResolver(CONDITIONS);

	test("condition resolver maps every part shape", () => {
		expect(resolver("dark")).toEqual({ selectors: [".dark"], atRules: [] });
		expect(resolver("sm")).toEqual({ selectors: [], atRules: ["@media (min-width: 640px)"] });
		expect(resolver("hover")).toEqual({ selectors: [":root:hover"], atRules: [] });
		expect(resolver("supportHover")).toEqual({
			selectors: [":root:hover"],
			atRules: ["@media (hover: hover) and (pointer: fine)"],
		});
		expect(resolver("unknown-condition")).toBeNull();
	});

	test("base lands in @theme, variants become standalone override rules", () => {
		const groups = {
			colors: { success: { base: "#60A3BC", dark: "#2C7A7B", hover: "#90BFD0" } },
		};
		const themeCss = buildThemeBlock(groups, resolver);
		expect(themeCss).toContain("@theme {\n\t--color-success: #60a3bc;\n}");
		expect(themeCss).toContain(".dark {\n\t\t--color-success: #2c7a7b;\n\t}");
		expect(themeCss).toContain(":root:hover {\n\t\t--color-success: #90bfd0;\n\t}");
	});

	test("compound conditions nest media around the selector rule", () => {
		const themeCss = buildThemeBlock(
			{ colors: { success: { base: "#60a3bc", supportHover: "#2c7a7b" } } },
			resolver,
		);
		expect(themeCss).toContain("@media (hover: hover) and (pointer: fine) {");
		expect(themeCss.indexOf("@media (hover: hover)")).toBeLessThan(themeCss.indexOf(":root:hover"));
	});

	test("unresolvable variant drops the WHOLE token (no partial semantics)", () => {
		const themeCss = buildThemeBlock(
			{
				colors: {
					good: "#123456",
					bad: { base: "#60a3bc", mysteryCondition: "#2c7a7b" },
				},
			},
			resolver,
		);
		expect(themeCss).toContain("--color-good");
		expect(themeCss).not.toContain("--color-bad");
	});

	test("flat string tokens are unaffected when a resolver is supplied", () => {
		const before = buildThemeBlock({ colors: { "$blue-500": "#3182CE" } });
		const after = buildThemeBlock({ colors: { "$blue-500": "#3182CE" } }, resolver);
		expect(after).toBe(before);
	});

	test("deterministic output", () => {
		const groups = {
			colors: { success: { base: "#60A3BC", dark: "#2C7A7B", sm: "#4299E1" } },
		};
		expect(buildThemeBlock(groups, resolver)).toBe(buildThemeBlock(groups, resolver));
	});
});

describe("resolvePresetConditions", () => {
	test("finds the conditions record on an exported preset-like object", () => {
		const preset = { tokens: { colors: { x: "#123123" } }, conditions: { dark: ".dark &" } };
		expect(resolvePresetConditions({ examplePreset: preset })).toEqual({ dark: ".dark &" });
	});

	test("returns undefined when no object carries conditions", () => {
		expect(resolvePresetConditions({ somethingElse: { foo: "bar" } })).toBeUndefined();
	});
});

describe("loadThemeBlock package-specifier resolution", () => {
	// Regression: the generate CLI resolved bare package specifiers (e.g.
	// `@pandwind/example-preset`) via a bare dynamic import, so Node's
	// self-reference resolution used the *nearest* package.json. A stray
	// manifest inside the pandwind dist tree then redirected the specifier to
	// a nonexistent `dist/dist/...` path and broke generate. Resolution must
	// anchor on the CLI project root instead.
	// The hazard only triggers when the *importing module* lives inside
	// packages/pandwind/dist (the built CLI), because that is when Node
	// consults a stray dist/package.json as the nearest manifest. Source-level
	// callers are immune, so this test drives the built module. CI builds
	// pandwind before testing; locally the test skips when dist is absent.
	test("resolves pandwind preset through the project root despite a stray package manifest", async (ctx) => {
		const packageRoot = resolve(import.meta.dirname, "..");
		const distRoot = resolve(packageRoot, "dist");
		const builtModule = resolve(distRoot, "tw/codegen-theme-input.js");
		if (!existsSync(builtModule)) {
			ctx.skip();
			return;
		}
		const strayManifest = resolve(distRoot, "package.json");
		// The poison: a manifest whose exports paths are relative to dist/ as
		// package root — doubling the path to dist/dist/... — exactly what the
		// recurring playground generate failure produced.
		const poison = JSON.stringify({
			name: "pandwind",
			type: "module",
			exports: { "./preset/example-preset": "./dist/preset/example-preset.js" },
		});
		mkdirSync(distRoot, { recursive: true });
		writeFileSync(strayManifest, poison);
		try {
			const built = (await import(
				pathToFileURL(builtModule).href
			)) as typeof import("../src/tw/codegen-theme-input.ts");
			// base = the app calling the CLI; the stray dist manifest must be
			// irrelevant because resolution goes through createRequire(base).
			const themeBlock = await built.loadThemeBlock(
				"@pandwind/example-preset",
				resolve(import.meta.dirname, "../../../apps/example"),
			);
			expect(themeBlock).toContain("--color");
		} finally {
			rmSync(strayManifest, { force: true });
		}
	});
});

describe("typegen with condition-bound theme block", () => {
	const CONDITIONS = { dark: ".dark &" };
	const THEME_BLOCK = buildThemeBlock(
		{ colors: { success: { base: "#60a3bc", dark: "#2c7a7b" } } },
		createConditionResolver(CONDITIONS),
	);

	test("injected overrides keep token utilities in the generated unions", async () => {
		const { typesDts } = await generateDesignSystem(css, srcDir, { themeBlock: THEME_BLOCK });
		expect(typesDts).toContain("success");
	});

	test("the emitted artifact carries the override rules verbatim", async () => {
		expect(THEME_BLOCK).toContain(".dark {");
		expect(THEME_BLOCK).toContain("--color-success: #2c7a7b;");
	});

	test("emitted overrides survive real Tailwind compilation", async () => {
		const { compile } = await import("@tailwindcss/node");
		const res = await compile(`@import "tailwindcss";\n${THEME_BLOCK}`, {
			base: srcDir,
			onDependency: () => {},
		});
		const out = res.build(["bg-success"]) as string;
		// Base value in :root (from @theme) AND the .dark override rule
		// survive real compilation; the utility references the var so the
		// cascade applies whichever condition matches at runtime.
		expect(out).toContain(":root, :host {");
		expect(out).toContain(".dark {");
		expect(out).toContain("--color-success: #2c7a7b");
		expect(out).toContain("background-color: var(--color-success)");
	});
});
