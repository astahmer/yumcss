/**
 * Chakra UI v3 starter preset.
 *
 * Two independent claims are checked here:
 *
 * 1. The checked-in theme data is exactly what the installed @chakra-ui/react
 *    package renders today, so upstream drift shows up as a failing diff
 *    instead of a silent divergence.
 * 2. Every shipped token resolves to the value Chakra's own system publishes
 *    for the same authored value, so the preset cannot claim parity it does
 *    not have.
 *
 * Seven deliberate normalizations are asserted rather than byte-equal ports:
 *
 * - Colors carry Pandwind's $ sigil, which is what makes an authored
 *   color: "$gray.700" a token reference; the bare gray.700 spelling stays
 *   valid as Chakra's own canonical alias.
 * - Chakra's fraction keys (1/2, 2/3, ...) ship in the 1-2 form, because
 *   Pandwind reads a slash as its color opacity modifier.
 * - The transitions group is composed, not transcribed: each keyword of
 *   Chakra's transition utility expands to a property list plus a duration and
 *   an easing, which the single shorthand Pandwind binds joins back together.
 * - transitionProperties ships verbatim: that utility already names the list.
 * - The blurs group is absent, because Chakra reaches it only through its blur
 *   utility, which writes a --blur custom property instead of a CSS property.
 * - The animations group is absent for the same reason: each entry is a
 *   shorthand whose @keyframes body Chakra keeps in its own theme.keyframes,
 *   which this preset does not ship.
 * - zIndex.base is declared as 0 yet resolves to nothing through system.token,
 *   so the parity sweep compares it against the declared theme leaf instead.
 * - textEmphasisColor is the one bound property Chakra's runtime utility map
 *   omits: the property accepts the same colors, but resolves them to the
 *   authored value instead of a custom property reference.
 */
import { readFileSync } from "node:fs";
import { parse } from "postcss";
import { describe, expect, test } from "vitest";
import { createCss } from "../src/css/create-css.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import {
	chakraConditions,
	chakraPreset,
	chakraProperties,
	chakraTokens,
} from "../src/preset/chakra.ts";
import { presetConditions } from "../src/preset/conditions.ts";
import { defaultPreset } from "../src/preset/default.ts";
import { chakraTheme } from "../src/preset/generated/chakra-theme.ts";
import {
	chakraPresetModulePath,
	renderChakraPresetModule,
} from "../../../scripts/promote-chakra-preset.ts";
import { chakraOracle } from "./helpers/chakra-oracle.ts";

/** Token groups the generator reads straight from Chakra's theme.tokens. */
const STATIC_TOKEN_GROUPS = [
	"aspectRatios",
	"borders",
	"colors",
	"cursor",
	"durations",
	"easings",
	"fonts",
	"fontSizes",
	"fontWeights",
	"letterSpacings",
	"lineHeights",
	"radii",
	"sizes",
	"spacing",
	"zIndex",
] as const;

/** Groups Chakra reaches through a utility that composes several declarations. */
const COMPOSED_GROUPS = new Set(["transitions"]);

const collapsed = (value: string): string => value.replaceAll(/\s+/gu, " ").trim();

/** The name a Chakra project authors for a shipped token key. */
const authoredName = (group: string, name: string): string => {
	if (group === "colors") return name.slice(1);
	if (group === "sizes" && /^\d+-\d+$/u.test(name)) return name.replace("-", "/");
	return name;
};

const chakraPath = (group: string, name: string): string => group + "." + authoredName(group, name);

const boundProperties = Object.entries(chakraProperties).flatMap(([property, binding]) => {
	const group =
		typeof binding === "object" && binding !== null && "$tokens" in binding
			? binding.$tokens
			: undefined;
	return typeof group === "string" ? [[property, group] as const] : [];
});

const chakraCss = createCss(chakraPreset);

const atomicOf = (styles: Parameters<typeof chakraCss.raw>[0]): string => {
	const sheet = createStylesheet(chakraPreset);
	sheet.process([chakraCss.raw(styles)]);
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

const sortedPairs = <TValue>(
	entries: ReadonlyArray<readonly [string, TValue]>,
): Record<string, TValue> =>
	Object.fromEntries(entries.toSorted(([left], [right]) => left.localeCompare(right)));

/** Chakra's transition keyword flattened to the single shorthand Pandwind binds. */
const composedTransition = async (keyword: string): Promise<string> => {
	const { system, inlineVariables } = await chakraOracle();
	const resolved = system.css({ transition: keyword });
	const properties = resolved.transition;
	if (typeof properties !== "string")
		throw new Error("Chakra publishes no transition list for " + keyword);
	if (properties === "none") return properties;
	const duration = resolved.transitionDuration;
	const timingFunction = resolved.transitionTimingFunction;
	if (typeof duration !== "string" || typeof timingFunction !== "string")
		throw new Error("Chakra publishes no duration or easing for " + keyword);
	return inlineVariables(properties)
		.split(",")
		.map((property) => collapsed(property) + " " + duration + " " + timingFunction)
		.join(", ");
};

describe("chakra preset data", () => {
	test("the checked-in data matches a fresh render of the installed package", async () => {
		const checkedIn = readFileSync(chakraPresetModulePath, "utf8");
		const rendered = await renderChakraPresetModule();

		expect(checkedIn).toBe(rendered.contents);
		expect(checkedIn).toContain("@chakra-ui/react@" + rendered.version);
		expect(chakraTheme.version).toBe(rendered.version);
	});

	test("the preset stays off the default preset barrel", async () => {
		const barrel = await import("../src/preset/index.ts");

		expect("chakraPreset" in barrel).toBe(false);
		expect("chakraTokens" in barrel).toBe(false);
		expect(defaultPreset.tokens).toEqual({});
	});

	test("the catalog carries every generated scale and nothing else", () => {
		expect(Object.keys(chakraTokens)).toEqual([
			"aspectRatios",
			"borders",
			"colors",
			"cursor",
			"durations",
			"easings",
			"fonts",
			"fontSizes",
			"fontWeights",
			"letterSpacings",
			"lineHeights",
			"radii",
			"sizes",
			"spacing",
			"zIndex",
			"transitions",
			"transitionProperties",
			"shadows",
		]);
		expect(
			Object.fromEntries(
				Object.entries(chakraTokens).map(([group, values]) => [group, Object.keys(values).length]),
			),
		).toEqual({
			aspectRatios: 6,
			borders: 5,
			colors: 243,
			cursor: 8,
			durations: 7,
			easings: 4,
			fonts: 3,
			fontSizes: 14,
			fontWeights: 9,
			letterSpacings: 5,
			lineHeights: 5,
			radii: 14,
			sizes: 86,
			spacing: 34,
			zIndex: 13,
			transitions: 10,
			transitionProperties: 5,
			shadows: 8,
		});
		expect(Object.keys(chakraTheme.tokens)).toEqual([...STATIC_TOKEN_GROUPS]);
		expect(Object.keys(chakraTheme.semanticTokens)).toEqual(["colors", "shadows", "radii"]);
	});

	test("the color-mode scales switch on Chakra's own light and dark selectors", () => {
		expect(chakraConditions.base).toBe("");
		expect(chakraConditions._light).toBe(":root &, .light &");
		expect(chakraConditions._dark).toBe(".dark &, .dark .chakra-theme:not(.light) &");
	});

	test("the condition map layers Chakra's states over the stock conditions", async () => {
		const { config } = await chakraOracle();
		const upstream = Object.fromEntries(
			Object.entries(config.conditions).map(([name, value]) => ["_" + name, value]),
		);

		expect(Object.keys(upstream)).toHaveLength(104);
		expect(Object.keys(chakraTheme.conditions)).toHaveLength(104);
		expect(Object.keys(chakraConditions)).toHaveLength(113);
		expect(new Set(Object.keys(chakraConditions))).toEqual(
			new Set([
				...Object.keys(upstream),
				...Object.keys(presetConditions),
				...Object.keys(chakraTheme.breakpoints),
				"base",
				"_light",
				"_dark",
			]),
		);
		expect(presetConditions._hover).toBe("&:is(:hover, [data-hover])");
		expect(chakraConditions._hover).toEqual([
			"@media (hover: hover)",
			"&:is(:hover, [data-hover]):not(:disabled, [data-disabled])",
		]);
		expect(chakraConditions.sm).toBe("@media (min-width: 480px)");
		expect(chakraConditions.md).toBe("@media (min-width: 768px)");
		expect(chakraConditions.lg).toBe("@media (min-width: 1024px)");
		expect(chakraConditions.xl).toBe("@media (min-width: 1280px)");
		expect(chakraConditions["2xl"]).toBe("@media (min-width: 1536px)");
	});

	test("every color root keeps Chakra's authored palette order with gray last", () => {
		const rootsFromTokens = Object.keys(chakraTheme.tokens.colors).map((name) =>
			(name.split(".")[0] ?? name).replace(/^\$/u, ""),
		);
		const rootsFromSemantics = Object.keys(chakraTheme.semanticTokens.colors).map(
			(name) => name.replace(/^\$/u, "").split(".")[0] ?? name,
		);
		const expected = [
			...new Set([...rootsFromTokens, ...rootsFromSemantics].filter((root) => root !== "gray")),
		].toSorted((left, right) => left.localeCompare(right));

		expect(chakraTheme.colorPalettes).toEqual([...expected, "gray"]);
		expect(chakraTheme.colorPalettes.at(-1)).toBe("gray");
		expect(Object.keys(chakraPreset.colorPalettes)).toHaveLength(chakraTheme.colorPalettes.length);
		expect(Object.keys(chakraPreset.colorPalettes).at(-1)).toBe("gray");
		expect(sortedPairs(Object.entries(chakraPreset.colorPalettes))).toEqual(
			sortedPairs(chakraTheme.colorPalettes.map((root) => [root, "colors.$" + root] as const)),
		);
	});

	test("Chakra's spellings survive the rename with the sigil on colors", () => {
		expect(chakraTokens.sizes["1-2"]).toBe("50%");
		expect("1/2" in chakraTokens.sizes).toBe(false);
		expect(Object.keys(chakraTokens.sizes).filter((name) => /^\d+-\d+$/u.test(name))).toHaveLength(
			25,
		);
		expect(chakraTokens.colors["$gray.700"]).toBe("#3f3f46");
		expect("gray.700" in chakraTokens.colors).toBe(false);
		expect(Object.keys(chakraTokens.colors).every((key) => key.startsWith("$"))).toBe(true);
	});

	test("semantic tokens keep their Chakra paths and color modes", () => {
		expect(chakraTheme.semanticTokens.colors["$bg.subtle"]).toEqual({
			_light: "colors.$gray.50",
			_dark: "colors.$gray.950",
		});
		expect(chakraTheme.semanticTokens.colors["$fg.muted"]).toEqual({
			_light: "colors.$gray.600",
			_dark: "colors.$gray.400",
		});
		expect(chakraTheme.semanticTokens.colors.$border).toEqual({
			_light: "colors.$gray.200",
			_dark: "colors.$gray.800",
		});
		expect(chakraTheme.semanticTokens.colors["$blue.solid"]).toEqual({
			_light: "colors.$blue.600",
			_dark: "colors.$blue.600",
		});
		expect(chakraTheme.semanticTokens.radii).toEqual({
			l1: { base: "radii.xs" },
			l2: { base: "radii.sm" },
			l3: { base: "radii.md" },
		});
		expect(Object.keys(chakraTheme.semanticTokens.shadows)).toEqual([
			"2xl",
			"inner",
			"inset",
			"lg",
			"md",
			"sm",
			"xl",
			"xs",
		]);
		expect(Object.keys(chakraTokens.colors).filter((key) => key.startsWith("$blue."))).toHaveLength(
			19,
		);
		expect(Object.keys(chakraTokens.colors).filter((key) => /^\$blue\.\d/u.test(key))).toHaveLength(
			11,
		);
	});

	test("Chakra's reserved z-index base is the one path its own lookup misses", async () => {
		const { config, system } = await chakraOracle();

		expect(chakraTokens.zIndex.base).toBe("0");
		expect(JSON.stringify(config.theme.tokens.zIndex?.base)).toBe('{"value":0}');
		expect(system.token("zIndex.base")).toBeUndefined();
		expect(system.css({ zIndex: "base" })).toEqual({ zIndex: "var(--chakra-z-index-base)" });
	});
});

describe("chakra preset parity with the installed system", () => {
	test("every static token resolves to the value Chakra publishes", async () => {
		const { system } = await chakraOracle();
		const mismatches: string[] = [];
		let checked = 0;
		let skipped = 0;

		for (const group of STATIC_TOKEN_GROUPS) {
			for (const [name, shipped] of Object.entries(chakraTokens[group] ?? {})) {
				if (typeof shipped !== "string") {
					skipped += 1;
					continue;
				}
				checked += 1;
				const published = collapsed(String(system.token(chakraPath(group, name))));
				if (published !== shipped)
					mismatches.push(
						group +
							"." +
							name +
							" (" +
							chakraPath(group, name) +
							"): Chakra " +
							published +
							" !== preset " +
							shipped,
					);
			}
		}

		expect(checked).toBe(346);
		expect(skipped).toBe(110);
		expect(mismatches).toEqual(["zIndex.base (zIndex.base): Chakra undefined !== preset 0"]);
	});

	test("every bound property resolves every token it owns to the shipped literal", async () => {
		const oracle = await chakraOracle();
		const mismatches: string[] = [];
		let checked = 0;
		let skipped = 0;

		for (const [property, group] of boundProperties) {
			if (COMPOSED_GROUPS.has(group)) continue;
			for (const [name, shipped] of Object.entries(chakraTokens[group] ?? {})) {
				if (typeof shipped !== "string") {
					skipped += 1;
					continue;
				}
				checked += 1;
				const resolved = oracle.system.css({ [property]: authoredName(group, name) })[property];
				if (typeof resolved !== "string") {
					mismatches.push(property + " " + name + ": Chakra resolved to " + String(resolved));
					continue;
				}
				let literal: string;
				try {
					literal = oracle.inlineVariables(resolved);
				} catch (error) {
					mismatches.push(property + " " + name + ": " + String(error));
					continue;
				}
				if (literal !== shipped)
					mismatches.push(property + " " + name + ": Chakra " + literal + " !== preset " + shipped);
			}
		}

		const divergences = new Map<string, number>();
		for (const line of mismatches) {
			const property = line.split(" ")[0] ?? "";
			divergences.set(property, (divergences.get(property) ?? 0) + 1);
		}

		expect(checked).toBe(4375);
		expect(skipped).toBe(1541);
		// textEmphasisColor is the only property Chakra's runtime utility map omits:
		// it returns the authored color instead of the custom property every other
		// color property resolves to. The runtime proof lives in the block below.
		expect([...divergences.keys()]).toEqual(["textEmphasisColor"]);
	});

	test("the property Chakra's utility map omits still binds at runtime", () => {
		const atomic = atomicOf({ textEmphasisColor: "$gray.700" });

		expect(atomic).toContain("text-emphasis-color:var(--");
		expect(atomic).not.toContain("#3f3f46");
	});

	test("composed transitions match Chakra's own transition utility", async () => {
		expect(Object.keys(chakraTokens.transitions)).toEqual([
			"all",
			"backgrounds",
			"colors",
			"common",
			"none",
			"opacity",
			"position",
			"shadow",
			"size",
			"transform",
		]);
		expect(chakraTokens.transitions.none).toBe("none");
		for (const [keyword, shorthand] of Object.entries(chakraTokens.transitions)) {
			if (keyword === "none") continue;
			expect(shorthand).toBe(await composedTransition(keyword));
		}
	});

	test("transitionProperty tokens ship Chakra's keyword lists verbatim", async () => {
		const { config, inlineVariables } = await chakraOracle();
		const published = sortedPairs(
			Object.entries(config.utilities.transitionProperty.values).map(
				([keyword, value]) => [keyword, collapsed(inlineVariables(value))] as const,
			),
		);

		expect(chakraTokens.transitionProperties).toEqual(published);
		expect(chakraTokens.transitionProperties.colors).toBe(
			"background-color, border-color, color, fill, stroke",
		);
	});
});

describe("chakra preset runtime resolution", () => {
	test("bound properties resolve into custom properties instead of literals", () => {
		const css = createCss(chakraPreset);
		const sheet = createStylesheet(chakraPreset);
		sheet.process([css.raw({ color: "$gray.700", backgroundColor: "$bg", padding: 4 })]);

		const atomic = sheet.gen.atomic();
		expect(atomic).toContain("padding:4px");
		expect(atomic).toContain("color:var(--");
		expect(atomic).toContain("background-color:var(--");
		expect(atomic).not.toContain("#3f3f46");

		const tokens = sheet.gen.tokens();
		expect(tokens).toContain("#3f3f46");
		expect(tokens).toContain(":root");
		expect(tokens).toContain(".dark");
		expect(tokens).toContain(".light");
	});

	test("the bare Chakra spelling aliases the sigiled token", () => {
		expect(declarationsOf(atomicOf({ color: "gray.700" }))).toEqual(
			declarationsOf(atomicOf({ color: "$gray.700" })),
		);
	});

	test("semantic colors switch on Chakra's color-mode selectors", () => {
		const atomic = atomicOf({ _dark: { color: "$fg.muted" }, _light: { color: "$fg" } });

		expect(atomic).toContain(":root ");
		expect(atomic).toContain(".light ");
		expect(atomic).toContain(".dark ");
		expect(atomic).toContain(".dark .chakra-theme:not(.light) ");
	});

	test("a colorPalette rule declares every role variable it references", () => {
		const failures: string[] = [];
		for (const role of [
			"contrast",
			"fg",
			"subtle",
			"muted",
			"emphasized",
			"solid",
			"focusRing",
			"border",
			"500",
			"950",
		]) {
			const atomic = atomicOf({ colorPalette: "blue", color: "colorPalette." + role });
			const referenced = /color:var\(--([^)]+)\)/u.exec(atomic)?.[1];
			if (referenced === undefined) {
				failures.push(role + ": no color declaration");
				continue;
			}
			if (!atomic.includes("--" + referenced + ":"))
				failures.push(role + ": references undeclared " + referenced);
		}

		expect(failures).toEqual([]);
		expect(
			declarationsOf(atomicOf({ colorPalette: "blue", color: "colorPalette.focusRing" })).filter(
				(declaration) => declaration.prop.startsWith("--"),
			),
		).toHaveLength(19);
	});

	test('tokens: "used" emits only what the styles reference', () => {
		const css = createCss(chakraPreset);
		const full = createStylesheet(chakraPreset).gen.tokens();
		const used = createStylesheet(chakraPreset, {}, { tokens: "used" });
		used.process([css.raw({ color: "$gray.700" })]);

		expect(used.gen.tokens()).toContain("#3f3f46");
		expect(used.gen.tokens()).not.toContain(".dark");
		expect(used.gen.tokens().length).toBeLessThan(full.length / 100);

		const semantic = createStylesheet(chakraPreset, {}, { tokens: "used" });
		semantic.process([css.raw({ color: "$bg.subtle" })]);
		expect(semantic.gen.tokens()).toContain(":root , .light {");
		expect(semantic.gen.tokens()).toContain(".dark , .dark .chakra-theme:not(.light) {");
	});

	test("orders breakpoint rules from narrowest to widest", () => {
		const widths: number[] = [];
		parse(atomicOf({ md: { padding: 4 }, sm: { padding: 8 } })).walkAtRules("media", (media) => {
			const match = /min-width:\s*(\d+)px/u.exec(media.params);
			if (match?.[1] !== undefined) widths.push(Number.parseInt(match[1], 10));
		});

		expect(widths).toEqual([480, 768]);
	});

	test("Chakra reads its logical scroll forms as raw lengths only", () => {
		expect(atomicOf({ scrollMargin: 4 })).toContain("scroll-margin:4px");
		expect(atomicOf({ scrollMargin: "4" })).toContain("scroll-margin:var(--");

		const logical = atomicOf({ scrollMarginInline: 4, scrollPaddingInlineStart: 4 } as never);
		expect(logical).toContain("scroll-margin-inline:4px");
		expect(logical).toContain("scroll-padding-inline-start:4px");
		expect(logical).not.toContain("var(--");
		expect("scrollMarginInline" in chakraProperties).toBe(false);
		expect(chakraProperties.scrollMarginTop).toEqual({
			$tokens: "spacing",
			$strictness: "inherits",
		});
	});

	test("each transition longhand emits a single binding declaration", () => {
		const lanes = [
			{ styles: { transition: "colors" }, property: "transition" },
			{ styles: { transitionProperty: "colors" }, property: "transition-property" },
			{ styles: { transitionDuration: "fast" }, property: "transition-duration" },
			{ styles: { transitionTimingFunction: "ease-in" }, property: "transition-timing-function" },
		];

		for (const lane of lanes) {
			const declarations = declarationsOf(atomicOf(lane.styles));
			expect(declarations).toHaveLength(1);
			expect(declarations[0]?.prop).toBe(lane.property);
			expect(declarations[0]?.value.startsWith("var(--")).toBe(true);
		}
	});
});
