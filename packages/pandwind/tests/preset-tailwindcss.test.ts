/**
 * Tailwind v4 starter preset.
 *
 * Two independent claims are checked here:
 *
 * 1. The checked-in theme data is exactly what the installed `tailwindcss`
 *    package renders today, so upstream drift shows up as a failing diff
 *    instead of a silent divergence.
 * 2. Every shipped token resolves to the value the real Tailwind compiler
 *    publishes for the equivalent utility, so the preset cannot claim parity
 *    it does not have.
 *
 * Two extractions are deliberate normalizations rather than byte-equal ports,
 * and are asserted as such:
 *
 * - `transition-*` stores one `property duration timing` shorthand per
 *   utility, while Tailwind emits separate `transition-property`,
 *   `transition-duration`, and `transition-timing-function` declarations and
 *   lists its own `--tw-gradient-*` runtime properties in the property list.
 * - `shadow-*` composes a `box-shadow` from Tailwind's `--tw-shadow`
 *   plumbing. `shadow-none` has no theme value at all upstream, so the preset
 *   stores the CSS keyword and the compiler's plumbing is asserted separately.
 * - Font stacks are compared with whitespace collapsed and quotes unified:
 *   Tailwind serializes one stack with double quotes in emitted CSS and single
 *   quotes through `theme.namespace()`, which is where the preset reads it.
 */
import { readFileSync } from "node:fs";
import { parse, type Root } from "postcss";
import { describe, expect, test } from "vitest";
import { createCss } from "../src/css/create-css.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { selectorClassMatches } from "../src/css/selector-scan.ts";
import { defaultPreset } from "../src/preset/default.ts";
import { tailwindConditions, tailwindPreset, tailwindTokens } from "../src/preset/tailwindcss.ts";
import { tailwindcssTheme } from "../src/preset/generated/tailwindcss-theme.ts";
import {
	renderTailwindPresetModule,
	tailwindPresetModulePath,
} from "../../../scripts/promote-tailwind-preset.ts";
import { compileClasses, rulesForClass, resolveVar } from "./helpers/tailwind-proof.ts";

const TAILWIND_ENTRY = '@import "tailwindcss";';

const compileCandidates = (candidates: ReadonlyArray<string>) =>
	compileClasses(TAILWIND_ENTRY, [...candidates]);

const declarationOf = (root: Root, candidate: string, property: string): string => {
	const [rule] = rulesForClass(root, candidate);
	if (rule === undefined) throw new Error(`Tailwind compiled '${candidate}' to no rule`);
	const values: string[] = [];
	rule.walkDecls(property, (decl) => {
		values.push(decl.value);
	});
	const [value] = values;
	if (value === undefined)
		throw new Error(`Tailwind compiled '${candidate}' without '${property}'`);
	return value;
};

/** A theme variable resolved to its literal value, or undefined when unused. */
const publishedThemeValue = (vars: Map<string, string>, name: string): string | undefined => {
	if (!vars.has(`--${name}`)) return undefined;
	return resolveVar(`var(--${name})`, vars);
};

/**
 * Resolve Tailwind's own runtime plumbing to the fallback each declaration
 * carries. Utilities such as `shadow-md` never read the `--shadow-*` theme
 * namespace, so the compiled declaration plus this unwrapping is the only
 * published value for them.
 */
const unwrapPlumbing = (value: string, vars: Map<string, string>): string =>
	resolveVar(value, vars).replaceAll(/\s+/gu, " ").trim();

/** CSS-equivalent text: whitespace collapsed and string quotes unified. */
const canonicalValue = (value: string): string =>
	value.replaceAll(/\s+/gu, " ").trim().replaceAll('"', "'");

/**
 * Token groups whose keys are Tailwind theme namespaces, with the utility
 * prefix that publishes each namespace.
 */
const namespaceLanes: ReadonlyArray<{
	readonly tokens: Record<string, string>;
	readonly namespace: string;
	readonly utility: string;
	readonly property: string;
}> = [
	{
		tokens: tailwindTokens.fontFamilies,
		namespace: "--font",
		utility: "font",
		property: "font-family",
	},
	{ tokens: tailwindTokens.fontSizes, namespace: "--text", utility: "text", property: "font-size" },
	{
		tokens: tailwindTokens.fontWeights,
		namespace: "--font-weight",
		utility: "font",
		property: "font-weight",
	},
	{
		tokens: tailwindTokens.letterSpacings,
		namespace: "--tracking",
		utility: "tracking",
		property: "letter-spacing",
	},
	{
		tokens: tailwindTokens.lineHeights,
		namespace: "--leading",
		utility: "leading",
		property: "line-height",
	},
	{
		tokens: tailwindTokens.radii,
		namespace: "--radius",
		utility: "rounded",
		property: "border-radius",
	},
	{
		tokens: tailwindTokens.shadows,
		namespace: "--shadow",
		utility: "shadow",
		property: "--tw-shadow",
	},
	{
		tokens: tailwindTokens.textShadows,
		namespace: "--text-shadow",
		utility: "text-shadow",
		property: "text-shadow",
	},
	{
		tokens: tailwindTokens.containers,
		namespace: "--container",
		utility: "max-w",
		property: "max-width",
	},
];

/**
 * Keys a group carries beyond its Tailwind namespace. Tailwind v4 keeps these
 * keywords in its utility definitions rather than in `theme.css`, so the
 * preset stores the compiled value and the namespace parity test must not
 * expect a theme variable for them.
 */
const namespaceExtras: Record<string, ReadonlyArray<string>> = {
	"--leading": ["none"],
	"--radius": ["none", "full"],
	"--shadow": ["none"],
	"--text-shadow": ["none"],
	"--container": ["none", "prose"],
};

const BREAKPOINTS = Object.keys(tailwindcssTheme.breakpoints);

describe("tailwindcss preset data", () => {
	test("the checked-in theme data matches a fresh render of the installed package", async () => {
		const checkedIn = readFileSync(tailwindPresetModulePath, "utf8");
		const rendered = await renderTailwindPresetModule();

		expect(checkedIn).toBe(rendered.contents);
		expect(checkedIn).toContain(`tailwindcss@${rendered.version}`);
	});

	test("the preset stays off the default preset barrel", async () => {
		const barrel = await import("../src/preset/index.ts");

		expect("tailwindPreset" in barrel).toBe(false);
		expect("tailwindcssTheme" in barrel).toBe(false);
		expect(defaultPreset.tokens).toEqual({});
	});
});

describe("tailwindcss preset parity with the installed compiler", () => {
	test("every color stop resolves to the value Tailwind publishes", async () => {
		const entries = Object.entries(tailwindTokens.colors).map(([key, shipped]) => ({
			key,
			shipped,
			utility: `text-${key.slice(1)}`,
		}));
		const { root, vars } = await compileCandidates(entries.map((entry) => entry.utility));
		const mismatches: string[] = [];

		for (const entry of entries) {
			const published =
				publishedThemeValue(vars, `color-${entry.key.slice(1)}`) ??
				resolveVar(declarationOf(root, entry.utility, "color"), vars);
			if (published !== entry.shipped)
				mismatches.push(`${entry.key}: Tailwind ${published} !== preset ${entry.shipped}`);
		}

		expect(mismatches).toEqual([]);
	});

	test("every namespace entry matches the value Tailwind publishes", async () => {
		const entries = namespaceLanes.flatMap((lane) =>
			Object.entries(lane.tokens).map(([key, shipped]) => ({
				lane,
				key,
				shipped,
				utility: `${lane.utility}-${key}`,
			})),
		);
		const { root, vars } = await compileCandidates(entries.map((entry) => entry.utility));
		const mismatches: string[] = [];

		for (const entry of entries) {
			const name = `${entry.lane.namespace.slice(2)}-${entry.key}`;
			if (namespaceExtras[entry.lane.namespace]?.includes(entry.key)) continue;
			const published =
				publishedThemeValue(vars, name) ??
				unwrapPlumbing(
					declarationOf(root, `${entry.lane.utility}-${entry.key}`, entry.lane.property),
					vars,
				);
			if (canonicalValue(published) !== canonicalValue(entry.shipped))
				mismatches.push(`${name}: Tailwind ${published} !== preset ${entry.shipped}`);
		}

		expect(mismatches).toEqual([]);
	});

	test("keyword tokens match the declaration Tailwind compiles for the same utility", async () => {
		const zIndices = Object.entries(tailwindTokens.zIndices);
		const candidates = [
			"rounded-none",
			"rounded-full",
			"shadow-none",
			"shadow-md",
			"max-w-none",
			"max-w-prose",
			"text-shadow-none",
			"leading-none",
			"transition-none",
			...zIndices.map(([key]) => `z-${key}`),
		];
		const { root, vars } = await compileCandidates(candidates);

		expect(tailwindTokens.radii.none).toBe(declarationOf(root, "rounded-none", "border-radius"));
		expect(tailwindTokens.radii.full).toBe(declarationOf(root, "rounded-full", "border-radius"));
		expect(tailwindTokens.containers.none).toBe(declarationOf(root, "max-w-none", "max-width"));
		expect(tailwindTokens.containers.prose).toBe(declarationOf(root, "max-w-prose", "max-width"));
		expect(tailwindTokens.textShadows.none).toBe(
			declarationOf(root, "text-shadow-none", "text-shadow"),
		);
		expect(tailwindTokens.lineHeights.none).toBe(
			declarationOf(root, "leading-none", "line-height"),
		);
		expect(tailwindTokens.transitions.none).toBe(
			declarationOf(root, "transition-none", "transition-property"),
		);
		for (const [key, shipped] of zIndices)
			expect(shipped).toBe(declarationOf(root, `z-${key}`, "z-index"));

		expect(tailwindTokens.shadows.none).toBe("none");
		expect(declarationOf(root, "shadow-none", "--tw-shadow")).toBe("0 0 #0000");
		expect(tailwindTokens.shadows.md).toBe(
			resolveVar(declarationOf(root, "shadow-md", "--tw-shadow"), vars),
		);
	});

	test("transition tokens mirror Tailwind's properties, duration, and timing", async () => {
		const keys = ["all", "colors", "shadow", "transform", "opacity"] as const;
		const { root, vars } = await compileCandidates(keys.map((key) => `transition-${key}`));

		for (const key of keys) {
			const utility = `transition-${key}`;
			const properties = declarationOf(root, utility, "transition-property")
				.split(",")
				.map((property) => property.trim())
				.filter((property) => !property.startsWith("--tw-"));
			// Tailwind publishes the duration and timing through `--tw-duration`
			// / `--tw-ease` fallbacks that resolve to the `--default-*` theme
			// values the preset stores.
			const duration = unwrapPlumbing(declarationOf(root, utility, "transition-duration"), vars);
			const timing = unwrapPlumbing(
				declarationOf(root, utility, "transition-timing-function"),
				vars,
			);
			const expected = properties.map((property) => `${property} ${duration} ${timing}`).join(", ");

			expect(tailwindTokens.transitions[key]).toBe(expected);
		}
	});

	test("breakpoint conditions match the media queries Tailwind emits", async () => {
		const { root } = await compileCandidates(BREAKPOINTS.map((name) => `${name}:flex`));
		const published = new Map<string, string>();

		root.walkAtRules("media", (media) => {
			media.walkRules((rule) => {
				for (const name of BREAKPOINTS) {
					const matches = selectorClassMatches(rule.selector);
					if (matches.some((match) => match.value === `${name}:flex`))
						published.set(name, media.params.trim());
				}
			});
		});

		for (const name of BREAKPOINTS) {
			const params = published.get(name);
			expect(params, `Tailwind should emit a media query for ${name}:flex`).toBeDefined();
			const width = /^\(width >= (\d+(?:\.\d+)?)rem\)$/.exec(params!);
			expect(
				width,
				`${name}:flex media query ${params} should use rem range syntax`,
			).not.toBeNull();
			const pixels = Number.parseFloat(width![1]!) * 16;

			const conditions: Record<string, string> = tailwindConditions;

			expect(
				conditions[name],
				`the preset must declare a ${name} condition; add it to breakpointConditions`,
			).toBe(`@media (min-width: ${pixels}px)`);
		}
	});
});

describe("tailwindcss preset runtime resolution", () => {
	test("resolves bound namespaces into custom properties instead of literals", () => {
		const css = createCss(tailwindPreset);
		const sheet = createStylesheet(tailwindPreset);
		sheet.process([css.raw({ color: "$slate-700", backgroundColor: "$white", padding: 4 })]);

		const atomic = sheet.gen.atomic();
		expect(atomic).toContain("padding:4px");
		expect(atomic).toContain("color:var(--");
		expect(atomic).not.toContain("oklch(37.2% 0.044 257.287)");

		const tokens = sheet.gen.tokens();
		expect(tokens).toContain("oklch(37.2% 0.044 257.287)");
		expect(tokens).toContain("oklch(12.9% 0.042 264.695)");
		expect(tokens).toContain("#fff");
	});

	test('tokens: "used" emits only the tokens the styles reference', () => {
		const css = createCss(tailwindPreset);
		const used = createStylesheet(tailwindPreset, {}, { tokens: "used" });
		used.process([css.raw({ color: "$slate-700" })]);

		const tokens = used.gen.tokens();
		expect(tokens).toContain("oklch(37.2% 0.044 257.287)");
		expect(tokens).not.toContain("oklch(12.9% 0.042 264.695)");
		expect(tokens.length).toBeLessThan(createStylesheet(tailwindPreset).gen.tokens().length);
	});

	test("orders breakpoint rules from narrowest to widest", () => {
		const css = createCss(tailwindPreset);
		const sheet = createStylesheet(tailwindPreset);
		sheet.process([css.raw({ md: { padding: 4 }, sm: { padding: 8 } })]);

		const widths: number[] = [];
		parse(sheet.gen.atomic()).walkAtRules("media", (media) => {
			const match = /min-width:\s*(\d+)px/.exec(media.params);
			if (match?.[1] !== undefined) widths.push(Number.parseInt(match[1], 10));
		});

		expect(widths).toEqual([640, 768]);
	});
});
