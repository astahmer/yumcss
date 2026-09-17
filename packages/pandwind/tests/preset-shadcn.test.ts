/**
 * shadcn/ui starter preset.
 *
 * Two claims are checked here, against two different references:
 *
 * 1. The checked-in theme data is exactly what the pinned shadcn/ui checkout
 *    renders today, so upstream drift is a failing diff instead of a silent
 *    divergence. That check needs the pinned clone; it is skipped with the
 *    prepare command when `~/.references` has not been provisioned.
 * 2. Every shipped value is what the create page's own algorithms produce for
 *    the same configuration. The registry values live in the shadcn/ui
 *    repository rather than in the published `shadcn` package, so the
 *    reference is `tests/helpers/shadcn-oracle.ts`, a transcription of those
 *    algorithms over the checked-in data.
 *
 * The preset is a faithful reproduction of the create page, not a byte-equal
 * port of one of its outputs. Four deliberate normalizations are asserted
 * rather than described:
 *
 * - Color roles carry Pandwind's `$` sigil, which is what makes an authored
 *   `color: "$card-foreground"` a token reference. Pandwind's unprefixed
 *   alias is the dot-delimited form of a sigiled name (`$blue-500` also reads
 *   as `blue.500`); a shadcn role keeps its hyphens, so it has no such form
 *   and the bare spelling stays a literal.
 * - The custom-property names keep shadcn's own kebab spelling
 *   (`--card-foreground`, `--chart-1`), because those names are what the
 *   project's own registry components read.
 * - The blocks are declaration data, never compiler output: `--radius` is
 *   declared alongside the `calc(var(--radius) * n)` multipliers, and the
 *   pointer rule ships as a string, because a Pandwind preset has no hook that
 *   writes a stylesheet.
 * - The radius follows the create page's style rewrite (`lyra` forces
 *   `none`, `sera` with any radius but `none` forces `none`, `rhea` with
 *   `large` becomes `default`) rather than the project form's own selection,
 *   because that is the configuration the page builds and the URL it copies.
 */
import { readFileSync } from "node:fs";
import { parse } from "postcss";
import { describe, expect, test } from "vitest";
import { createCss } from "../src/css/create-css.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { shadcnTheme } from "../src/preset/generated/shadcn-theme.ts";
import { presetProperties } from "../src/preset/properties.ts";
import {
	createShadcnPreset,
	shadcnColorRoles,
	shadcnConditions,
	shadcnDeclarations,
	shadcnPreset,
	shadcnProperties,
	shadcnThemesForBaseColor,
	shadcnTokens,
	resolveShadcnConfig,
} from "../src/preset/shadcn.ts";
import {
	renderShadcnPresetModule,
	shadcnPresetModulePath,
} from "../../../scripts/promote-shadcn-preset.ts";
import {
	createReferenceWorkspace,
	inspectReferenceAvailability,
	REFERENCE_AVAILABILITY,
} from "../../../scripts/reference-workspace.ts";
import {
	buildRegistryBaseThemeVars,
	buildThemeCssText,
	buildThemeForPreset,
	effectiveRadius,
} from "./helpers/shadcn-oracle.ts";
import type { ShadcnConfig, ShadcnPresetOptions } from "../src/preset/shadcn.ts";

const shadcnReference = inspectReferenceAvailability(
	createReferenceWorkspace(),
	"shadcn-ui",
);

const baseColorNames: ReadonlySet<string> = new Set(shadcnTheme.baseColorNames);

const radiusNames: ReadonlyArray<ShadcnConfig["radius"]> = [
	"default",
	"none",
	"small",
	"medium",
	"large",
];

/**
 * The create page's CLI vocabulary lists `gray`, while the option types exclude
 * it because the registry publishes no values for it. The runtime guard is the
 * only path to it, so the test widens the authored value first.
 */
const asOptionValue = <TValue>(value: string): TValue => value as TValue;

const shadcnCss = createCss(shadcnPreset);

const atomicOf = (styles: Parameters<typeof shadcnCss.raw>[0]): string => {
	const sheet = createStylesheet(shadcnPreset);
	sheet.process([shadcnCss.raw(styles)]);
	return sheet.gen.atomic();
};

const declarationsOf = (
	block: string,
): Array<{ readonly prop: string; readonly value: string }> => {
	const declarations: Array<{ prop: string; value: string }> = [];
	parse(block).walkDecls((declaration) => {
		declarations.push({ prop: declaration.prop, value: declaration.value });
	});
	return declarations;
};

const resolved = (options: ShadcnPresetOptions = {}): ShadcnConfig =>
	resolveShadcnConfig(options);

/**
 * Whether a stock binding is the shared color map, which is the one group
 * `presetProperties` binds without naming its group.
 */
const isStockColorBinding = (binding: unknown): boolean =>
	typeof binding === "object" &&
	binding !== null &&
	"$strictness" in binding &&
	!("$tokens" in binding);

const configurationLabel = (options: ShadcnPresetOptions): string => {
	const config = resolved(options);
	return [
		config.baseColor,
		config.theme,
		config.chartColor,
		config.style,
		config.font,
		config.fontHeading,
		config.radius,
		config.menuAccent,
		String(config.pointer),
	].join("/");
};

/**
 * Compare one configuration's declared blocks against the create page.
 *
 * The light block is a superset by design: it carries the font variables and
 * the radius multipliers a generated project stylesheet publishes, so the
 * assertion is that every property the create page declares is present with
 * the same value and that nothing else was invented.
 */
const expectCreatePageEnvironment = (options: ShadcnPresetOptions): void => {
	const config = resolved(options);
	const label = configurationLabel(options);
	const expected = buildThemeForPreset(config);
	const { cssVariables } = shadcnDeclarations(config);
	const fontKeys = Object.keys(shadcnDeclarations(config).cssVariables.light).filter((key) =>
		key.startsWith("font-"),
	);
	const multiplierKeys = Object.keys(shadcnTheme.radiusMultipliers);
	const accounted = new Set([...Object.keys(expected.light), ...fontKeys, ...multiplierKeys]);

	expect(Object.keys(cssVariables.dark).toSorted(), label).toEqual(
		Object.keys(expected.dark).toSorted(),
	);
	expect(Object.keys(cssVariables.light).toSorted(), label).toEqual(
		[...accounted].toSorted(),
	);

	for (const [name, value] of Object.entries(expected.light))
		expect(cssVariables.light[name], label + " light --" + name).toBe(value);
	for (const [name, value] of Object.entries(expected.dark))
		expect(cssVariables.dark[name], label + " dark --" + name).toBe(value);
};

describe("shadcn preset data", () => {
	test.skipIf(shadcnReference.status !== REFERENCE_AVAILABILITY.Available)(
		"the checked-in data matches a fresh render of the pinned checkout",
		async () => {
			const checkedIn = readFileSync(shadcnPresetModulePath, "utf8");
			const rendered = await renderShadcnPresetModule();

			expect(checkedIn).toBe(rendered.contents);
			expect(rendered.version).toBe(shadcnTheme.version);
		},
	);

	test("the reference pin the parity test needs is recorded", () => {
		expect(shadcnReference.path).toContain("shadcn-ui");
		expect(shadcnTheme.registryCommit).toHaveLength(40);
	});

	test("the preset stays off the default preset barrel", async () => {
		const barrel = await import("../src/preset/index.ts");

		expect("shadcnPreset" in barrel).toBe(false);
		expect("createShadcnPreset" in barrel).toBe(false);
		expect("shadcnTokens" in barrel).toBe(false);
	});

	test("every color role ships a light and a dark value", () => {
		const missing: string[] = [];
		for (const role of shadcnColorRoles) {
			const token = shadcnTokens.colors[`$${role}`];
			if (token === undefined) {
				missing.push(role + ": no token");
				continue;
			}
			if (token.base === "" || token._dark === "") missing.push(role + ": empty value");
		}

		expect(missing).toEqual([]);
		expect(shadcnColorRoles).toHaveLength(31);
	});

	test("the color roles are exactly the registry's own, behind the sigil", () => {
		const declared = new Set(
			Object.keys(shadcnTheme.baseColors.neutral.light)
				.filter((name) => name !== "radius")
				.map((name) => "$" + name),
		);

		expect(new Set(Object.keys(shadcnTokens.colors))).toEqual(declared);
		expect(Object.keys(shadcnTokens.colors).every((key) => key.startsWith("$"))).toBe(true);
	});

	test("the radius multipliers ship verbatim, beside the --radius they read", () => {
		expect(shadcnTokens.radii).toEqual(shadcnTheme.radiusMultipliers);
		expect(Object.keys(shadcnTheme.radiusValues).toSorted()).toEqual(
			radiusNames.toSorted(),
		);
		expect(Object.values(shadcnTheme.radiusMultipliers).every((value) =>
			value.includes("var(--radius)"),
		)).toBe(true);
		expect(shadcnDeclarations(resolved()).cssVariables.light.radius).toBe(
			shadcnTheme.defaultRadiusValue,
		);
	});

	test("a base color can only be themed by itself or by an accent", () => {
		const counts = shadcnTheme.baseColorNames.map(
			(baseColor) => shadcnThemesForBaseColor(baseColor).length,
		);
		const accents = shadcnTheme.themeNames.filter(
			(name) => !baseColorNames.has(name),
		);

		expect(new Set(counts)).toEqual(new Set([accents.length + 1]));
		expect(accents).toHaveLength(17);
		for (const baseColor of shadcnTheme.baseColorNames)
			expect(shadcnThemesForBaseColor(baseColor)).toContain(baseColor);
		for (const baseColor of shadcnTheme.baseColorNames)
			for (const other of shadcnTheme.baseColorNames)
				if (other !== baseColor)
					expect(shadcnThemesForBaseColor(baseColor)).not.toContain(other);
	});

	test("gray is rejected even though the CLI vocabulary lists it", () => {
		const [unsupportedBaseColor] = shadcnTheme.unsupportedBaseColors;
		const [unsupportedTheme] = shadcnTheme.unsupportedThemes;

		expect(shadcnTheme.baseColorNames).not.toContain(unsupportedBaseColor);
		expect(shadcnTheme.themeNames).not.toContain(unsupportedTheme);
		expect(unsupportedBaseColor).toBe(unsupportedTheme);

		expect(() =>
			createShadcnPreset({
				baseColor: asOptionValue<ShadcnConfig["baseColor"]>(unsupportedBaseColor),
			}),
		).toThrow(/no values/u);
		expect(() =>
			createShadcnPreset({ theme: asOptionValue<ShadcnConfig["theme"]>(unsupportedTheme) }),
		).toThrow(/no values/u);
	});

	test("the property map binds the scales shadcn owns and nothing else", () => {
		const bound = Object.entries(shadcnProperties).flatMap(([property, binding]) =>
			typeof binding === "object" && binding !== null && "$tokens" in binding
				? [[property, binding.$tokens] as const]
				: [],
		);
		const groups = new Set(bound.map(([, group]) => group));
		const stockColorProperties = Object.entries(presetProperties)
			.filter(([, binding]) => isStockColorBinding(binding))
			.map(([property]) => property);
		const shadcnColorProperties = bound
			.filter(([, group]) => group === "colors")
			.map(([property]) => property);

		expect(groups).toEqual(new Set(["colors", "radii", "fonts"]));
		expect(shadcnColorProperties).not.toEqual([]);
		expect(shadcnColorProperties.toSorted()).toEqual(stockColorProperties.toSorted());
		expect(shadcnConditions).toHaveProperty("_dark");
	});
});

describe("shadcn preset parity with the create page", () => {
	test("the default configuration reproduces the create page's variables", () => {
		const config = resolved();

		expect(config.baseColor).toBe(shadcnTheme.defaults.baseColor);
		expect(config.style).toBe(shadcnTheme.defaults.style);
		expect(config.font).toBe(shadcnTheme.defaults.font);
		expect(config.fontHeading).toBe(shadcnTheme.defaults.fontHeading);
		expect(config.menuAccent).toBe(shadcnTheme.defaults.menuAccent);
		expectCreatePageEnvironment({});
	});

	test("every base color reproduces the create page's variables", () => {
		for (const baseColor of shadcnTheme.baseColorNames)
			expectCreatePageEnvironment({ baseColor });
	});

	test("every accent a base color allows reproduces the create page", () => {
		for (const theme of shadcnThemesForBaseColor("zinc"))
			for (const chartColor of shadcnThemesForBaseColor("zinc"))
				expectCreatePageEnvironment({ baseColor: "zinc", theme, chartColor });
	});

	test("the chart color overrides both modes", () => {
		const config = resolved({ baseColor: "neutral", theme: "neutral", chartColor: "red" });
		const { light, dark } = shadcnDeclarations(config).cssVariables;
		const red = shadcnTheme.themes.red;

		for (const index of [1, 2, 3, 4, 5]) {
			expect(light["chart-" + index]).toBe(red.light[("chart-" + index) as "chart-1"]);
			expect(dark["chart-" + index]).toBe(red.dark[("chart-" + index) as "chart-1"]);
		}
		expect(light.background).toBe(shadcnTheme.themes.neutral.light.background);
	});

	test("a bold menu accent restates primary into the accent roles", () => {
		const subtle = shadcnDeclarations(resolved({ theme: "red" })).cssVariables;
		const bold = shadcnDeclarations(
			resolved({ theme: "red", menuAccent: "bold" }),
		).cssVariables;

		expect(bold.light.accent).toBe(bold.light.primary);
		expect(bold.light["accent-foreground"]).toBe(bold.light["primary-foreground"]);
		expect(bold.dark.accent).toBe(bold.dark.primary);
		expect(subtle.light.accent).not.toBe(subtle.light.primary);
		expectCreatePageEnvironment({ theme: "red", menuAccent: "bold" });
	});

	test("the radius follows the create page's style rewrite", () => {
		expect(effectiveRadius("lyra", "large")).toBe("none");
		expect(effectiveRadius("sera", "small")).toBe("none");
		expect(effectiveRadius("sera", "none")).toBe("none");
		expect(effectiveRadius("rhea", "large")).toBe("default");
		expect(effectiveRadius("rhea", "small")).toBe("small");
		expect(effectiveRadius("nova", "large")).toBe("large");

		for (const style of shadcnTheme.styles)
			for (const radius of radiusNames)
				for (const fontHeading of ["inherit", "geist"] as const)
					expectCreatePageEnvironment({
						style,
						radius,
						fontHeading,
					});

		expect(shadcnDeclarations(resolved({ style: "lyra", radius: "large" })).cssVariables
			.light.radius).toBe(shadcnTheme.radiusValues.none);
		expect(shadcnDeclarations(resolved({ style: "rhea", radius: "large" })).cssVariables
			.light.radius).toBe(shadcnDeclarations(resolved({ radius: "default" })).cssVariables
			.light.radius);
	});

	test("--font-heading inherits the body font's own variable", () => {
		const inherited = shadcnDeclarations(resolved({ font: "inter" })).cssVariables.light;
		const own = shadcnDeclarations(
			resolved({ font: "inter", fontHeading: "geist" }),
		).cssVariables.light;
		const spelled = shadcnDeclarations(
			resolved({ font: "inter", fontHeading: "inter" }),
		).cssVariables.light;

		expect(inherited["font-heading"]).toBe("var(" + shadcnTheme.fonts.inter.variable + ")");
		expect(spelled["font-heading"]).toBe(inherited["font-heading"]);
		expect(own["font-heading"]).toBe(shadcnTheme.fonts.geist.family);
		expect(buildRegistryBaseThemeVars(resolved({ font: "inter" }))["--font-heading"]).toBe(
			inherited["font-heading"],
		);
		expect(buildRegistryBaseThemeVars(resolved({ fontHeading: "geist" }))).toEqual({});

		for (const font of shadcnTheme.fontOrder) {
			const light = shadcnDeclarations(resolved({ font, fontHeading: "inherit" })).cssVariables
				.light;
			const bodyFont = shadcnTheme.fonts[font];
			expect(light[bodyFont.variable.slice("--".length)]).toBe(bodyFont.family);
			expect(light["font-heading"]).toBe("var(" + bodyFont.variable + ")");
		}
	});

	test("the preset's blocks render to the create page's stylesheet", () => {
		const config = resolved({ pointer: true });
		const { cssVariables } = shadcnDeclarations(config);
		const css = buildThemeCssText(
			{
				light: cssVariables.light,
				dark: cssVariables.dark,
			},
			config.pointer,
		);

		expect(css.indexOf(":root {")).toBe(0);
		expect(css).toContain("\n.dark {");
		expect(css.indexOf(":root {")).toBeLessThan(css.indexOf(".dark {"));
		expect(css).toContain("--" + "background: " + shadcnTheme.baseColors.neutral.light.background + ";");
		expect(css).toContain(
			"@layer base {\n  " + shadcnTheme.pointerSelector + " {\n    cursor: pointer;\n  }\n}\n",
		);
		expect(
			buildThemeCssText({ light: cssVariables.light, dark: cssVariables.dark }, false),
		).not.toContain("cursor: pointer");
	});

	test("the pointer rule is opt-in and stays out of the blocks", () => {
		expect(shadcnDeclarations(resolved()).pointerCss).toBeUndefined();
		expect(shadcnDeclarations(resolved({ pointer: true })).pointerCss).toContain(
			shadcnTheme.pointerSelector,
		);
		expect(Object.keys(shadcnDeclarations(resolved({ pointer: true })).cssVariables.light)).not.toContain(
			"cursor",
		);
	});
});

describe("shadcn preset runtime resolution", () => {
	test("bound properties resolve into custom properties instead of literals", () => {
		const atomic = atomicOf({
			color: "$card-foreground",
			backgroundColor: "$background",
			borderRadius: "lg",
			fontFamily: "sans",
		});

		expect(atomic).toContain("color:var(--");
		expect(atomic).toContain("background-color:var(--");
		expect(atomic).not.toContain(shadcnTheme.baseColors.neutral.light["card-foreground"]);

		const tokens = createStylesheet(shadcnPreset).gen.tokens();
		expect(tokens).toContain(shadcnTheme.baseColors.neutral.light["card-foreground"]);
		expect(tokens).toContain(":root");
		expect(tokens).toContain(".dark");
	});

	test("the sigiled kebab spelling is the token reference", () => {
		const cardForeground = declarationsOf(atomicOf({ color: "$card-foreground" }));
		const chartOne = declarationsOf(atomicOf({ color: "$chart-1" }));

		expect(cardForeground).toEqual([
			{ prop: "color", value: expect.stringMatching(/^var\(--/u) },
		]);
		expect(chartOne).toEqual([{ prop: "color", value: expect.stringMatching(/^var\(--/u) }]);
		expect(cardForeground).not.toEqual(chartOne);
	});

	test("the token conditions select the same two modes shadcn styles for", () => {
		const sheet = createStylesheet(shadcnPreset);
		sheet.process([shadcnCss.raw({ color: "$foreground" })]);
		const tokens = sheet.gen.tokens();
		const base = /color:var\(--([^)]+)\)/u.exec(atomicOf({ color: "$foreground" }))?.[1];

		expect(base).toBeDefined();
		expect(tokens.split("\n").filter((line) => line.includes(`--${base}:`))).toEqual([
			`:root {--${base}: ${shadcnTheme.baseColors.neutral.light.foreground};}`,
			`.dark {--${base}: ${shadcnTheme.baseColors.neutral.dark.foreground};}`,
		]);
		expect(shadcnConditions._dark).toBe(".dark &");
		expect(atomicOf({ _dark: { color: "$foreground" } })).toMatch(/^\.dark /u);
	});

	test('tokens: "used" emits only what the styles reference', () => {
		const full = createStylesheet(shadcnPreset).gen.tokens();
		const used = createStylesheet(shadcnPreset, {}, { tokens: "used" });
		used.process([shadcnCss.raw({ color: "$foreground" })]);
		const usedTokens = used.gen.tokens();

		expect(usedTokens).toContain(shadcnTheme.baseColors.neutral.light.foreground);
		expect(usedTokens).toContain(shadcnTheme.baseColors.neutral.dark.foreground);
		expect(usedTokens).not.toContain(shadcnTheme.baseColors.neutral.light.primary);
		expect(usedTokens.split("\n")).toHaveLength(2);
		expect(usedTokens.length).toBeLessThan(full.length / 10);
	});

	test("a derived preset emits both modes of a paired token", () => {
		const derived = createShadcnPreset({ baseColor: "zinc", theme: "red" });
		const sheet = createStylesheet(derived);
		sheet.process([createCss(derived).raw({ color: "$sidebar-ring" })]);
		const tokens = sheet.gen.tokens();

		expect(tokens).toContain(shadcnTheme.baseColors.zinc.light["sidebar-ring"]);
		expect(tokens).toContain(shadcnTheme.baseColors.zinc.dark["sidebar-ring"]);
	});

	test("a theme or chart color the base color cannot take falls back to it", () => {
		const available = shadcnThemesForBaseColor("stone");
		const themed = resolved({ baseColor: "zinc", theme: "stone" });
		const charted = resolved({ baseColor: "stone", chartColor: "zinc" });

		expect(available[0]).toBe("stone");
		expect(resolved({ baseColor: "stone" }).theme).toBe("stone");
		expect(resolved({ baseColor: "stone" }).chartColor).toBe("stone");
		expect(themed.theme).toBe("zinc");
		expect(themed.chartColor).toBe("zinc");
		expect(charted.theme).toBe("stone");
		expect(charted.chartColor).toBe("stone");
		expect(shadcnDeclarations(charted).cssVariables.light["chart-1"]).toBe(
			shadcnTheme.themes.stone.light["chart-1"],
		);
		expectCreatePageEnvironment({ baseColor: "stone" });
	});
});
