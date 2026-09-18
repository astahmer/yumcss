/**
 * Panda CSS starter preset.
 *
 * Three independent claims are checked here:
 *
 * 1. The checked-in data is exactly what the installed @pandacss/config
 *    resolver renders for Panda's stock default configuration, so upstream
 *    drift shows up as a failing diff instead of a silent divergence.
 * 2. Every shipped token equals the value Panda's own resolver publishes for
 *    the same path, so the preset cannot claim parity it does not have.
 * 3. Every bound property is either derivable from Panda's own utility
 *    definitions or one of the documented hand bindings, so a scale this
 *    preset binds cannot drift out from under the parity suite.
 *
 * Four deliberate normalizations are asserted rather than byte-equal ports:
 *
 * - The transitions group is composed, not transcribed: each keyword of
 *   Panda's transition utility expands to a property list plus a duration and
 *   an easing, which the single shorthand Pandwind binds joins back together.
 * - transitionProperties ships verbatim: that utility already names the list.
 * - The blurs group is absent, because Panda reaches it only through its blur
 *   and backdropBlur utilities, which write --blur custom properties instead
 *   of a CSS property.
 * - keyframes, textStyles, containerSizes, the patterns, and the recipes are
 *   absent, because Pandwind binds no property to them, and the animations
 *   group goes with keyframes: a shorthand whose body nothing declares is a
 *   dangling reference rather than a usable token.
 */
import { readFileSync } from "node:fs";
import { parse } from "postcss";
import { describe, expect, test } from "vitest";
import { createCss } from "../src/css/create-css.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { presetConditions } from "../src/preset/conditions.ts";
import { defaultPreset } from "../src/preset/default.ts";
import { pandaTheme } from "../src/preset/generated/panda-theme.ts";
import { pandaConditions, pandaPreset, pandaProperties, pandaTokens } from "../src/preset/panda.ts";
import { presetProperties } from "../src/preset/properties.ts";
import {
	isTokenLeaf,
	pandaPresetModulePath,
	renderPandaPresetModule,
	type PandaTokenEntry,
} from "../../../scripts/promote-panda-preset.ts";
import { pandaConfig } from "./helpers/panda-preset-oracle.ts";

/** Token scales the generator reads straight from Panda's theme.tokens. */
const STATIC_TOKEN_GROUPS = [
	"aspectRatios",
	"borders",
	"easings",
	"durations",
	"radii",
	"fontWeights",
	"lineHeights",
	"fonts",
	"letterSpacings",
	"fontSizes",
	"shadows",
	"colors",
	"spacing",
	"sizes",
] as const;

/** Scale names Panda publishes through a utility instead of a token group. */
const COMPOSED_GROUPS = ["transitions", "transitionProperties"];

/**
 * Bindings Panda's own utilities do not name.
 *
 * The derivation below reads a utility's values key to find the scale it
 * resolves against, which covers every property Panda names after the CSS
 * property it sets. These are the rest: the logical sizing and spacing
 * shorthands, whose utilities are size and margin aliases, and the two
 * composed transition vocabularies, whose utilities carry their keywords
 * inline rather than referencing a scale.
 */
const HAND_BINDINGS = {
	sizes: [
		"blockSize",
		"flexBasis",
		"height",
		"inlineSize",
		"maxBlockSize",
		"maxHeight",
		"maxInlineSize",
		"maxWidth",
		"minBlockSize",
		"minHeight",
		"minInlineSize",
		"minWidth",
		"width",
	],
	spacing: [
		"borderSpacing",
		"inset",
		"margin",
		"marginBlock",
		"marginBlockEnd",
		"marginBlockStart",
		"marginBottom",
		"marginInline",
		"marginInlineEnd",
		"marginInlineStart",
		"marginLeft",
		"marginRight",
		"marginTop",
	],
	transitions: ["transition"],
	transitionProperties: ["transitionProperty"],
} as const;

/**
 * Utilities whose values key names a scale, but whose authored name is not the
 * CSS property Panda writes: the directional radius shorthands set two corner
 * properties, and the ring, divide, gradient, and text-shadow colors write
 * custom properties Pandwind binds to its color properties instead.
 */
const UTILITIES_WITHOUT_A_PROPERTY = [
	"borderBottomRadius",
	"borderEndRadius",
	"borderLeftRadius",
	"borderRightRadius",
	"borderSpacingX",
	"borderSpacingY",
	"borderStartRadius",
	"borderTopRadius",
	"boxShadowColor",
	"divideColor",
	"focusRingColor",
	"focusRingOffset",
	"gradientFrom",
	"gradientTo",
	"gradientVia",
	"textShadowColor",
];

const collapsed = (value: string): string => value.replaceAll(/\s+/gu, " ").trim();

const camelCase = (name: string): string =>
	name.replace(/-([a-z0-9])/gu, (_, character: string) => character.toUpperCase());

const leafValue = (leaf: { readonly value: unknown }): string =>
	Array.isArray(leaf.value)
		? leaf.value.map((entry: string) => collapsed(entry)).join(", ")
		: collapsed(String(leaf.value));

/** A Panda token group flattened to the authored names this preset ships. */
const flattenGroup = (
	entries: Record<string, PandaTokenEntry>,
): Array<readonly [string, string]> => {
	const flat: Array<readonly [string, string]> = [];
	for (const [name, entry] of Object.entries(entries)) {
		if (isTokenLeaf(entry)) {
			flat.push([name, leafValue(entry)]);
			continue;
		}
		for (const [nested, leaf] of Object.entries(entry))
			flat.push([name + "." + nested, leafValue(leaf)]);
	}
	return flat;
};

const keywordList = (values: unknown, label: string): ReadonlyArray<string> => {
	if (!Array.isArray(values)) throw new Error("Panda publishes no " + label + " vocabulary");
	return values.map(String);
};

/** The literal behind a var(--name, fallback) reference, or the value itself. */
const literalOf = (value: unknown): string => {
	const text = String(value);
	return text.startsWith("var(") ? text.slice(text.indexOf(",") + 1, -1).trim() : text;
};

const boundProperties: ReadonlyArray<readonly [string, string]> = Object.entries(
	pandaProperties,
).flatMap(([property, binding]) => {
	const group =
		typeof binding === "object" && binding !== null && "$tokens" in binding
			? String(binding.$tokens)
			: undefined;
	return group === undefined ? [] : [[property, group] as const];
});

const pandaCss = createCss(pandaPreset);

const atomicOf = (styles: Parameters<typeof pandaCss.raw>[0]): string => {
	const sheet = createStylesheet(pandaPreset);
	sheet.process([pandaCss.raw(styles)]);
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

describe("panda preset data", () => {
	test("the checked-in data matches a fresh render of the installed package", async () => {
		const checkedIn = readFileSync(pandaPresetModulePath, "utf8");
		const rendered = await renderPandaPresetModule();

		expect(checkedIn).toBe(rendered.contents);
		expect(checkedIn).toContain("@pandacss/config@" + rendered.version);
		expect(pandaTheme.version).toBe(rendered.version);
	});

	test("the preset stays off the default preset barrel", async () => {
		const barrel = await import("../src/preset/index.ts");

		expect("pandaPreset" in barrel).toBe(false);
		expect("pandaTokens" in barrel).toBe(false);
		expect(defaultPreset.tokens).toEqual({});
	});

	test("the module carries the generated sections and nothing else", () => {
		expect(Object.keys(pandaTheme)).toEqual([
			"version",
			"tokens",
			"transitions",
			"transitionProperties",
			"conditions",
			"breakpoints",
		]);
		for (const absent of [
			"blurs",
			"keyframes",
			"textStyles",
			"containerSizes",
			"patterns",
			"recipes",
		])
			expect(absent in pandaTheme).toBe(false);
		expect("colorPalettes" in pandaPreset).toBe(false);
		expect(Object.keys(pandaTheme.tokens)).toEqual([...STATIC_TOKEN_GROUPS]);
	});

	test("the catalog carries every generated scale and nothing else", () => {
		expect(Object.keys(pandaTokens)).toEqual([...STATIC_TOKEN_GROUPS, ...COMPOSED_GROUPS]);
		expect(
			Object.fromEntries(
				Object.entries(pandaTokens).map(([group, values]) => [group, Object.keys(values).length]),
			),
		).toEqual({
			aspectRatios: 6,
			borders: 1,
			easings: 5,
			durations: 7,
			radii: 9,
			fontWeights: 9,
			lineHeights: 6,
			fonts: 3,
			letterSpacings: 6,
			fontSizes: 14,
			shadows: 10,
			colors: 246,
			spacing: 36,
			sizes: 53,
			transitions: 10,
			transitionProperties: 5,
		});
	});

	test("Panda's color roots keep their authored order", () => {
		expect([...new Set(Object.keys(pandaTokens.colors).map((key) => key.split(".")[0]))]).toEqual([
			"current",
			"black",
			"white",
			"transparent",
			"rose",
			"pink",
			"fuchsia",
			"purple",
			"violet",
			"indigo",
			"blue",
			"sky",
			"cyan",
			"teal",
			"emerald",
			"green",
			"lime",
			"yellow",
			"amber",
			"orange",
			"red",
			"neutral",
			"stone",
			"zinc",
			"gray",
			"slate",
		]);
		expect(Object.keys(pandaTokens.colors).some((key) => key.startsWith("$"))).toBe(false);
		expect(Object.keys(pandaTokens.colors).every((key) => key.split(".").length <= 2)).toBe(true);
		expect(pandaTokens.colors["red.500"]).toBe("#ef4444");
		expect(pandaTokens.colors.transparent).toBe("rgb(0 0 0 / 0)");
	});

	test("Panda's dotted scale steps ship as authored", () => {
		const dotted = ["0.5", "1.5", "2.5", "3.5", "4.5", "5.5"];

		expect(Object.keys(pandaTokens.spacing).filter((key) => key.includes("."))).toEqual(dotted);
		expect(Object.keys(pandaTokens.sizes).filter((key) => key.includes("."))).toEqual(dotted);
		expect(pandaTokens.spacing["0.5"]).toBe("0.125rem");
	});

	test("the two transition vocabularies ship as authored", () => {
		expect(Object.keys(pandaTokens.transitions)).toEqual([
			"none",
			"all",
			"common",
			"size",
			"position",
			"background",
			"colors",
			"opacity",
			"shadow",
			"transform",
		]);
		expect(pandaTokens.transitions.none).toBe("none");
		expect(pandaTokens.transitions.colors).toBe(
			[
				"color",
				"background-color",
				"border-color",
				"outline-color",
				"text-decoration-color",
				"fill",
				"stroke",
			]
				.map(
					(property) =>
						property + " " + pandaTokens.durations.fast + " " + pandaTokens.easings.default,
				)
				.join(", "),
		);
		expect(Object.keys(pandaTokens.transitionProperties)).toEqual([
			"common",
			"colors",
			"size",
			"position",
			"background",
		]);
		expect(pandaTokens.transitionProperties.colors).toBe(
			"color, background-color, border-color, outline-color, text-decoration-color, fill, stroke",
		);
	});

	test("the font stack and the single border keyword survive verbatim", () => {
		expect(pandaTokens.borders).toEqual({ none: "none" });
		expect(pandaTokens.fonts.sans.split(", ")).toHaveLength(14);
		expect(
			pandaTokens.fonts.sans.startsWith(
				"ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, ",
			),
		).toBe(true);
		expect(pandaTokens.fonts.sans.endsWith('"Noto Color Emoji"')).toBe(true);
		expect(Object.keys(pandaTokens.shadows)).toEqual([
			"2xs",
			"xs",
			"sm",
			"md",
			"lg",
			"xl",
			"2xl",
			"inset-2xs",
			"inset-xs",
			"inset-sm",
		]);
	});

	test("the condition map layers Panda's states and breakpoints over the stock conditions", async () => {
		const { config } = await pandaConfig();
		const upstream = Object.fromEntries(
			Object.entries(config.conditions).map(([name, value]) => ["_" + name, value]),
		);

		expect(Object.keys(upstream)).toHaveLength(107);
		expect(Object.keys(pandaTheme.conditions)).toHaveLength(107);
		expect(Object.keys(presetConditions)).toHaveLength(89);
		expect(Object.keys(pandaConditions)).toHaveLength(112);
		expect(new Set(Object.keys(pandaConditions))).toEqual(
			new Set([
				...Object.keys(upstream),
				...Object.keys(presetConditions),
				...Object.keys(pandaTheme.breakpoints),
			]),
		);
		expect(Object.keys(presetConditions).filter((key) => !(key in pandaConditions))).toEqual([]);
		expect(pandaConditions._hover).toBe("&:is(:hover, [data-hover])");
		expect(pandaConditions._icon).toBe("& :where(svg)");
		expect(pandaConditions._placeholder).toBe("&::placeholder, &[data-placeholder]");
		expect(pandaConditions._open).toBe(
			'&:is([open], [data-open], [data-state="open"], :popover-open)',
		);
		expect(pandaConditions._dark).toBe(".dark &");
		expect(pandaConditions.sm).toBe("@media (min-width: 640px)");
		expect(pandaConditions.md).toBe("@media (min-width: 768px)");
		expect(pandaConditions.lg).toBe("@media (min-width: 1024px)");
		expect(pandaConditions.xl).toBe("@media (min-width: 1280px)");
		expect(pandaConditions["2xl"]).toBe("@media (min-width: 1536px)");
	});
});

describe("panda preset parity with the installed package", () => {
	test("every static token resolves to the value Panda publishes", async () => {
		const { config } = await pandaConfig();
		const published = new Map(
			Object.entries(config.theme.tokens).map(([group, entries]) => [
				group,
				new Map(flattenGroup(entries)),
			]),
		);
		const mismatches: string[] = [];
		const unpaired: string[] = [];
		let checked = 0;

		for (const [group, values] of Object.entries(pandaTokens)) {
			const publishedGroup = published.get(group);
			if (publishedGroup === undefined) {
				unpaired.push(group);
				continue;
			}
			for (const [name, shipped] of Object.entries(values)) {
				checked += 1;
				const expected = publishedGroup.get(name);
				if (expected !== shipped)
					mismatches.push(
						group + "." + name + ": Panda " + String(expected) + " !== preset " + shipped,
					);
			}
		}

		expect(checked).toBe(411);
		expect(unpaired).toEqual([...COMPOSED_GROUPS]);
		expect(mismatches).toEqual([]);
	});

	test("every bound property is derivable from Panda's utilities or a hand binding", async () => {
		const { config } = await pandaConfig();
		const scales = new Set(Object.keys(pandaTokens));
		const derivable = new Map<string, string>();

		for (const [name, utility] of Object.entries(config.utilities)) {
			const values = utility.values;
			if (typeof values !== "string" || !scales.has(values)) continue;
			derivable.set(camelCase(name), values);
		}

		const shippedGroups = new Map(boundProperties);
		const handBindings = boundProperties.filter(([property]) => !derivable.has(property));
		const derivableWithoutBinding = [...derivable.keys()].filter(
			(property) => !shippedGroups.has(property),
		);
		const conflicts = [...derivable].filter(
			([property, group]) => shippedGroups.has(property) && shippedGroups.get(property) !== group,
		);

		expect(boundProperties).toHaveLength(143);
		expect(derivable.size).toBe(131);
		expect(boundProperties.length - handBindings.length).toBe(115);
		expect(Object.fromEntries(handBindings)).toEqual(
			Object.fromEntries(
				Object.entries(HAND_BINDINGS).flatMap(([group, properties]) =>
					properties.map((property) => [property, group] as const),
				),
			),
		);
		expect(derivableWithoutBinding.toSorted()).toEqual(UTILITIES_WITHOUT_A_PROPERTY);
		expect(conflicts).toEqual([]);
	});

	test("every bound scale resolves to the group Panda's utility reads", () => {
		const byGroup: Record<string, number> = {};
		for (const [, group] of boundProperties) byGroup[group] = (byGroup[group] ?? 0) + 1;

		expect(byGroup).toEqual({
			spacing: 69,
			colors: 23,
			sizes: 14,
			borders: 12,
			radii: 9,
			durations: 4,
			easings: 2,
			shadows: 2,
			aspectRatios: 1,
			fonts: 1,
			fontSizes: 1,
			fontWeights: 1,
			letterSpacings: 1,
			lineHeights: 1,
			transitions: 1,
			transitionProperties: 1,
		});
	});

	test("the properties Panda has no token scale for stay on Pandwind's own groups", () => {
		expect(pandaProperties.borderWidth).toEqual(presetProperties.borderWidth);
		expect(pandaProperties.outlineWidth).toEqual(presetProperties.outlineWidth);
		expect(pandaProperties.zIndex).toEqual(presetProperties.zIndex);
		expect(pandaProperties.cursor).toBe(true);
		expect(pandaProperties.opacity).toBe(true);
		expect(pandaProperties.borderWidth).toEqual({
			none: "0",
			"1px": "1px",
			"2px": "2px",
			"4px": "4px",
			"8px": "8px",
		});
		expect(pandaProperties.outlineOffset).toEqual({ $tokens: "spacing", $strict: false });
		expect(pandaProperties.scrollbarWidth).toEqual({ $tokens: "sizes", $strict: false });
		expect(pandaProperties.border).toEqual({ $tokens: "borders", $strict: false });
		expect(Object.hasOwn(presetProperties, "transitionProperty")).toBe(false);
		expect(pandaProperties.transitionProperty).toEqual({
			$tokens: "transitionProperties",
			$strict: false,
		});
		expect(pandaProperties.transition).toEqual({
			$tokens: "transitions",
			$strict: false,
		});
		expect(
			Object.values(presetProperties).filter(
				(binding) => typeof binding === "object" && binding !== null && "$tokens" in binding,
			),
		).toEqual([]);
	});

	test("the composed transition vocabulary matches Panda's own utility", async () => {
		const { config } = await pandaConfig();
		const keywords = keywordList(config.utilities.transition?.values, "transition");
		const transform = config.utilities.transition?.transform;
		if (transform === undefined) throw new Error("Panda publishes no transition utility");
		const utils = { colorMix: () => ({ invalid: true }), colorPalette: () => ({}) };

		const transitions: Record<string, string> = Object.fromEntries(
			Object.entries(pandaTokens.transitions),
		);
		expect(Object.keys(transitions)).toEqual(["none", ...keywords]);
		expect(transitions.none).toBe("none");
		for (const keyword of keywords) {
			const resolved = transform(keyword, { utils });
			const properties = literalOf(resolved.transitionProperty)
				.split(",")
				.map((property) => property.trim());

			expect(transitions[keyword]).toBe(
				properties
					.map(
						(property) =>
							property +
							" " +
							literalOf(resolved.transitionDuration) +
							" " +
							literalOf(resolved.transitionTimingFunction),
					)
					.join(", "),
			);
		}

		const published = config.utilities.transitionProperty?.values;

		expect(published).toBeDefined();
		expect(pandaTokens.transitionProperties).toEqual(
			typeof published === "object" && published !== null
				? Object.fromEntries(
						Object.entries(published).map(([keyword, value]) => [
							keyword,
							collapsed(String(value)),
						]),
					)
				: {},
		);
	});
});

describe("panda preset runtime resolution", () => {
	test("bound properties resolve into custom properties instead of literals", () => {
		const atomic = atomicOf({
			color: "red.500",
			backgroundColor: "gray.100",
			padding: 4,
			gap: "1.5",
			borderRadius: "md",
			height: "full",
		});

		expect(atomic).toContain("padding:4px");
		expect(atomic).toContain("color:var(--");
		expect(atomic).toContain("background-color:var(--");
		expect(atomic).toContain("gap:var(--");
		expect(atomic).toContain("border-radius:var(--");
		expect(atomic).toContain("height:var(--");
		expect(atomic).not.toContain("#ef4444");
		expect(atomic).not.toContain(pandaTokens.colors["gray.100"]);

		const sheet = createStylesheet(pandaPreset);
		sheet.process([pandaCss.raw({ color: "red.500" })]);
		const tokens = sheet.gen.tokens();
		expect(tokens).toContain("#ef4444");
		expect(tokens).toContain(":root");
	});

	test("Panda's own path is the token, and a sigiled spelling stays a literal", () => {
		const token = declarationsOf(atomicOf({ color: "red.500" }));
		const literal = declarationsOf(atomicOf({ color: "$red.500" }));

		expect(token).toHaveLength(1);
		expect(token[0]?.prop).toBe("color");
		expect(token[0]?.value.startsWith("var(--")).toBe(true);
		expect(literal).toEqual([{ prop: "color", value: "$red.500" }]);
	});

	test("the properties outside Panda's token scales still resolve as lengths", () => {
		expect(atomicOf({ zIndex: "docked" })).toContain("z-index:10");
		expect(atomicOf({ opacity: "50" })).toContain("opacity:50");
		expect(atomicOf({ borderWidth: "2px" })).toContain("border-width:2px");
		expect(atomicOf({ outlineOffset: 2 })).toContain("outline-offset:2px");
		expect(atomicOf({ margin: 4 })).toContain("margin:4px");
	});

	test("the bound shorthands reach their scale and keep raw CSS available", () => {
		expect(atomicOf({ border: "none" })).toContain("border:var(--");
		expect(atomicOf({ animationDuration: "fast" })).toContain("animation-duration:var(--");
		expect(atomicOf({ animation: "spin 1s linear infinite" })).toContain(
			"animation:spin 1s linear infinite",
		);
		expect(atomicOf({ scrollbarWidth: "thin" })).toContain("scrollbar-width:thin");
		expect(atomicOf({ padding: 4 })).toContain("padding:4px");
		expect(atomicOf({ padding: "1.5" })).toContain("padding:var(--");
	});

	test("Panda's states, breakpoints, and dark class drive the selectors", () => {
		const atomic = atomicOf({
			md: { fontSize: "lg" },
			_dark: { color: "gray.100" },
			_hover: { color: "gray.100" },
			_icon: { display: "none" },
		});

		expect(atomic).toContain("@media (min-width: 768px)");
		expect(atomic).toContain("font-size:var(--");
		expect(atomic).toContain(".dark ");
		expect(atomic).toContain(":hover");
		expect(atomic).toContain(":where(svg)");
	});

	test("each transition longhand emits a single binding declaration", () => {
		const lanes = [
			{ styles: { transition: "colors" }, property: "transition" },
			{ styles: { transitionProperty: "colors" }, property: "transition-property" },
			{ styles: { transitionDuration: "fast" }, property: "transition-duration" },
			{ styles: { transitionTimingFunction: "in" }, property: "transition-timing-function" },
		];

		for (const lane of lanes) {
			const declarations = declarationsOf(atomicOf(lane.styles));
			expect(declarations).toHaveLength(1);
			expect(declarations[0]?.prop).toBe(lane.property);
			expect(declarations[0]?.value.startsWith("var(--")).toBe(true);
		}
	});

	test('tokens: "used" emits only what the styles reference', () => {
		const full = createStylesheet(pandaPreset).gen.tokens();
		const used = createStylesheet(pandaPreset, {}, { tokens: "used" });
		used.process([pandaCss.raw({ color: "red.500" })]);

		expect(used.gen.tokens()).toContain("#ef4444");
		expect(used.gen.tokens().length).toBeLessThan(full.length / 100);
	});

	test("orders breakpoint rules from narrowest to widest", () => {
		const widths: number[] = [];
		parse(atomicOf({ md: { padding: 4 }, sm: { padding: 8 } })).walkAtRules("media", (media) => {
			const match = /min-width:\s*(\d+)px/u.exec(media.params);
			if (match?.[1] !== undefined) widths.push(Number.parseInt(match[1], 10));
		});

		expect(widths).toEqual([640, 768]);
	});
});
