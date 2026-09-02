/**
 * Panda inbound parser tests (plan 024 step 1).
 *
 * Corpus snippets are lifted from REAL files in ~/dev/panda/website so the
 * parser is validated against the actual migration target, not synthetic
 * shapes:
 * - src/mdx/navbar.tsx        (condition scopes, semantic tokens)
 * - src/mdx/pre.tsx           (cva: fan-out, important suffix, shorthands)
 * - src/www/feature-marquee.section.tsx (sva: slots, _motionReduce)
 * - theme/recipes/button.recipe.ts      (defineRecipe: variants, spread)
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import { existsSync } from "node:fs";
import {
	normalizePandaStyleObject,
	pandaRecipeToIr,
	pandaStyleToIr,
	parseObjectLiteral,
	parsePandaCalls,
	type PandaRecipeIR,
} from "../src/swap/adapters/panda/parse.ts";
import { loadPandaTheme, type PandaTheme } from "../src/swap/adapters/panda/theme.ts";
import { PandaJsxStylePropsModeTag } from "../src/swap/adapters/panda/style-props.ts";
import { PandaUtilityCatalog } from "../src/swap/adapters/panda/utilities.ts";
import { emitCssClass } from "../src/swap/emit.ts";
import type { ProjectModuleLoader } from "../src/swap/project-module-loader.ts";

const WEBSITE = `${process.env.HOME}/dev/panda/website`;

/** Theme mirroring what loadPandaTheme produces for the website config. */
const siteTheme: PandaTheme = {
	tokens: {},
	conditions: { midnight: "&:where([data-theme=midnight] *)" },
	tokenVars: new Map([
		["fg", "--colors-fg"],
		["fg.muted", "--colors-fg-muted"],
		["fg.headline", "--colors-fg-headline"],
		["bg", "--colors-bg"],
		["bg.muted", "--colors-bg-muted"],
		["bg.emphasized", "--colors-bg-emphasized"],
		["accent.subtle", "--colors-accent-subtle"],
		["neutral.700", "--colors-neutral-700"],
		["blackAlpha.500", "--colors-black-alpha-500"],
		["spacing.6", "--spacing-6"],
		["panda.h4", "--noop"],
	]),
	textStyles: new Map([
		["panda.h4", { fontSize: "1.625rem", lineHeight: "1.2", letterSpacing: "tight" }],
	]),
	customPatterns: new Map(),
	utilityCatalog: PandaUtilityCatalog.fromConfig({
		padding: { property: "padding", shorthand: "p" },
		paddingInline: { property: "paddingX", shorthand: "px" },
		paddingBlock: { property: "paddingY", shorthand: "py" },
		paddingTop: { property: "paddingTop", shorthand: "pt" },
		paddingRight: { property: "paddingRight", shorthand: "pr" },
		paddingBottom: { property: "paddingBottom", shorthand: "pb" },
		paddingLeft: { property: "paddingLeft", shorthand: "pl" },
		margin: { property: "margin", shorthand: "m" },
		marginInline: { property: "marginX", shorthand: ["mx", "ms", "me"] },
		marginBlock: { property: "marginY", shorthand: "my" },
		marginTop: { property: "marginTop", shorthand: "mt" },
		marginBottom: { property: "marginBottom", shorthand: "mb" },
		backgroundColor: { property: "backgroundColor", shorthand: "bg" },
		color: { property: "color", shorthand: "c" },
		borderRadius: { property: "borderRadius", shorthand: "rounded" },
		borderStartRadius: { property: "borderStartRadius", shorthand: "roundedStart" },
		borderTopRadius: { property: "borderTopRadius", shorthand: "roundedTop" },
		insetInlineStart: { property: "insetInlineStart", shorthand: "insetStart" },
		insetInlineEnd: { property: "insetInlineEnd", shorthand: "insetEnd" },
		maxWidth: { property: "maxWidth", shorthand: "maxW" },
		maxHeight: { property: "maxHeight", shorthand: "maxH" },
		minWidth: { property: "minWidth", shorthand: "minW" },
		minHeight: { property: "minHeight", shorthand: "minH" },
		width: { property: "width", shorthand: "w" },
		height: { property: "height", shorthand: "h" },
		paddingInlineStart: { property: "paddingInlineStart", shorthand: "ps" },
		paddingInlineEnd: { property: "paddingInlineEnd", shorthand: "pe" },
	}),
	jsxStyleProps: {
		mode: PandaJsxStylePropsModeTag.All,
		evidence: ["fallback"],
		matches: () => false,
	},
};

describe("panda css.class emission", () => {
	it("quotes CSS variables and nests condition chains as valid objects", () => {
		const ir = pandaStyleToIr(
			{ "--banner-height": "2.5rem", _dark: { _hover: { color: "white" } } },
			siteTheme,
		);
		const output = emitCssClass(ir, { bridgeInverse: new Map() } as never, {
			index: 1,
			tokenRefs: "bare",
			sort: true,
		}).text;
		expect(output).toContain('"--banner-height": "2.5rem"');
		expect(output).toContain('_dark: { _hover: { color: "white" } }');
	});
});

describe("PandaUtilityCatalog", () => {
	it("uses utility definitions supplied by the effective project config", () => {
		for (const key of [
			"bg",
			"py",
			"px",
			"mt",
			"rounded",
			"maxW",
			"w",
			"h",
			"mb",
			"my",
			"pt",
			"mx",
			"ms",
			"maxH",
			"pb",
			"minW",
			"minH",
			"pr",
			"pl",
			"me",
			"ps",
			"pe",
			"insetStart",
			"insetEnd",
			"roundedTop",
			"roundedStart",
		]) {
			expect(siteTheme.utilityCatalog.has(key), key).toBe(true);
		}
		expect(siteTheme.utilityCatalog.resolveProperty("px")).toBe("paddingX");
		expect(siteTheme.utilityCatalog.resolveProperty("projectOnly")).toBeUndefined();
		expect(siteTheme.utilityCatalog).toMatchInlineSnapshot(`
			PandaUtilityCatalog {
			  "propertyAliases": Map {
			    "p" => "padding",
			    "px" => "paddingX",
			    "py" => "paddingY",
			    "pt" => "paddingTop",
			    "pr" => "paddingRight",
			    "pb" => "paddingBottom",
			    "pl" => "paddingLeft",
			    "m" => "margin",
			    "mx" => "marginX",
			    "ms" => "marginX",
			    "me" => "marginX",
			    "my" => "marginY",
			    "mt" => "marginTop",
			    "mb" => "marginBottom",
			    "bg" => "backgroundColor",
			    "c" => "color",
			    "rounded" => "borderRadius",
			    "roundedStart" => "borderStartRadius",
			    "roundedTop" => "borderTopRadius",
			    "insetStart" => "insetInlineStart",
			    "insetEnd" => "insetInlineEnd",
			    "maxW" => "maxWidth",
			    "maxH" => "maxHeight",
			    "minW" => "minWidth",
			    "minH" => "minHeight",
			    "w" => "width",
			    "h" => "height",
			    "ps" => "paddingInlineStart",
			    "pe" => "paddingInlineEnd",
			  },
			  "utilityNames": Set {
			    "padding",
			    "p",
			    "paddingInline",
			    "px",
			    "paddingBlock",
			    "py",
			    "paddingTop",
			    "pt",
			    "paddingRight",
			    "pr",
			    "paddingBottom",
			    "pb",
			    "paddingLeft",
			    "pl",
			    "margin",
			    "m",
			    "marginInline",
			    "mx",
			    "ms",
			    "me",
			    "marginBlock",
			    "my",
			    "marginTop",
			    "mt",
			    "marginBottom",
			    "mb",
			    "backgroundColor",
			    "bg",
			    "color",
			    "c",
			    "borderRadius",
			    "rounded",
			    "borderStartRadius",
			    "roundedStart",
			    "borderTopRadius",
			    "roundedTop",
			    "insetInlineStart",
			    "insetStart",
			    "insetInlineEnd",
			    "insetEnd",
			    "maxWidth",
			    "maxW",
			    "maxHeight",
			    "maxH",
			    "minWidth",
			    "minW",
			    "minHeight",
			    "minH",
			    "width",
			    "w",
			    "height",
			    "h",
			    "paddingInlineStart",
			    "ps",
			    "paddingInlineEnd",
			    "pe",
			  },
			}
		`);
	});

	it("does not invent aliases when the project catalog is unavailable", () => {
		expect(normalizePandaStyleObject({ px: "2" })).toEqual({ px: "2" });
	});

	it("lowers Panda transforms using the project catalog", () => {
		expect(
			normalizePandaStyleObject(
				{
					boxSize: "5",
					ps: "2",
					insetEnd: "3",
					borderStartRadius: "lg",
					hideBelow: "md",
				},
				siteTheme.utilityCatalog,
			),
		).toEqual({
			width: "5",
			height: "5",
			paddingInlineStart: "2",
			insetInlineEnd: "3",
			borderStartStartRadius: "lg",
			borderEndStartRadius: "lg",
			mdDown: { display: "none" },
		});
	});
});

describe("pandaStyleToIr — navbar.tsx shapes", () => {
	it("translates condition scopes and semantic tokens", () => {
		const ir = pandaStyleToIr({ color: "fg.muted", _hover: { color: "fg" } }, siteTheme);
		expect(ir.residuals).toEqual([]);
		expect(ir.entries).toEqual([
			{ conditions: [], prop: "color", value: "$fg-muted" },
			{ conditions: ["hover"], prop: "color", value: "$fg" },
		]);
	});

	it("chains nested conditions outermost-first (_dark -> _hover)", () => {
		const ir = pandaStyleToIr({ _dark: { _hover: { color: "white" } } }, siteTheme);
		expect(ir.entries).toEqual([{ conditions: ["dark", "hover"], prop: "color", value: "white" }]);
	});

	it("recognizes configured custom conditions instead of a built-in breakpoint list", () => {
		const ir = pandaStyleToIr({ midnight: { color: "white" } }, siteTheme);
		expect(ir.residuals).toEqual([]);
		expect(ir.entries).toEqual([{ conditions: ["midnight"], prop: "color", value: "white" }]);
		expect(ir).toMatchInlineSnapshot(`
			{
			  "entries": [
			    {
			      "conditions": [
			        "midnight",
			      ],
			      "prop": "color",
			      "value": "white",
			    },
			  ],
			  "residuals": [],
			}
		`);
	});

	it("expands textStyle into its bundled declarations", () => {
		const ir = pandaStyleToIr({ textStyle: "panda.h4" }, siteTheme);
		expect(ir.entries).toEqual([
			{ conditions: [], prop: "fontSize", value: "1.625rem" },
			{ conditions: [], prop: "lineHeight", value: "1.2" },
			{ conditions: [], prop: "letterSpacing", value: "tight" },
		]);
	});

	it("residuals unknown textStyles instead of dropping them", () => {
		const ir = pandaStyleToIr({ textStyle: "sm" }, siteTheme);
		expect(ir.entries).toEqual([]);
		expect(ir.residuals).toHaveLength(1);
		expect(ir.residuals[0]!.kind).toBe("unknown-value");
	});
});

describe("pandaStyleToIr — mdx/pre.tsx cva base", () => {
	const base = {
		position: "relative",
		mt: { base: "6", _first: "0" },
		bg: "bg.muted!",
		overflowX: "auto",
		rounded: "xl",
		maxH: "640px",
	};

	it("fans per-property conditionals out into separate entries", () => {
		const ir = pandaStyleToIr(base, siteTheme);
		const margins = ir.entries.filter((e) => e.prop === "marginTop");
		expect(margins).toEqual([
			{ conditions: [], prop: "marginTop", value: "6" },
			{ conditions: ["first"], prop: "marginTop", value: "0" },
		]);
	});

	it("passes '!'-important values through verbatim", () => {
		const ir = pandaStyleToIr(base, siteTheme);
		const bg = ir.entries.find((e) => e.prop === "backgroundColor");
		// Known token path + important suffix stays AS WRITTEN.
		expect(bg?.value).toBe("$bg-muted!");
	});

	it("expands shorthands to canonical properties", () => {
		const ir = pandaStyleToIr(base, siteTheme);
		const props = ir.entries.map((e) => e.prop);
		expect(props).toContain("borderRadius"); // rounded
		expect(props).toContain("maxHeight"); // maxH
		expect(props).not.toContain("rounded");
		expect(props).not.toContain("maxH");
	});

	it("expands Panda multi-property utilities", () => {
		const ir = pandaStyleToIr(
			{ boxSize: "5", borderStartRadius: "lg", hideFrom: "md", ps: "2" },
			siteTheme,
		);
		expect(ir.residuals).toEqual([]);
		expect(ir.entries).toEqual([
			{ conditions: [], prop: "width", value: "5" },
			{ conditions: [], prop: "height", value: "5" },
			{ conditions: [], prop: "borderStartStartRadius", value: "lg" },
			{ conditions: [], prop: "borderEndStartRadius", value: "lg" },
			{ conditions: ["md"], prop: "display", value: "none" },
			{ conditions: [], prop: "paddingInlineStart", value: "2" },
		]);
	});

	it("does not turn an ambiguous built-in radius into a font token", () => {
		const ir = pandaStyleToIr({ borderRadius: "sm", fontSize: "sm" }, siteTheme);
		expect(ir.entries).toEqual([
			{ conditions: [], prop: "borderRadius", value: "sm" },
			{ conditions: [], prop: "fontSize", value: "sm" },
		]);
	});

	it("keeps unknown-token dotted values out of entries via CSS-var fallback + residual", () => {
		const ir = pandaStyleToIr({ color: "made.up.token" }, siteTheme);
		expect(ir.entries).toEqual([
			{ conditions: [], prop: "color", value: "var(--made-made-up-token)" },
		]);
		expect(ir.residuals[0]!.kind).toBe("unknown-value");
	});

	it("keeps plain CSS values verbatim without residuals", () => {
		const ir = pandaStyleToIr(
			{
				borderColor: { base: "rgba(0, 0, 0, 0.04)", _dark: "rgba(255, 255, 255, 0.1)" },
				width: "1.5rem",
			},
			siteTheme,
		);
		expect(ir.residuals).toEqual([]);
		expect(ir.entries).toEqual([
			{ conditions: [], prop: "borderColor", value: "rgba(0, 0, 0, 0.04)" },
			{ conditions: ["dark"], prop: "borderColor", value: "rgba(255, 255, 255, 0.1)" },
			{ conditions: [], prop: "width", value: "1.5rem" },
		]);
	});

	it("preserves nested selectors as condition paths", () => {
		const ir = pandaStyleToIr({ "& code[data-language] .line": { px: "4" } }, siteTheme);
		expect(ir.residuals).toEqual([]);
		expect(ir.entries).toEqual([
			{ conditions: ["& code[data-language] .line"], prop: "paddingX", value: "4" },
		]);
	});

	it("passes CSS custom-property declarations through verbatim", () => {
		// list.tsx pattern: local var + var() reference consumed by a conditional value.
		const ir = pandaStyleToIr(
			{ "--margin": "spacing.6", mt: { base: "var(--margin)", _first: "0" } },
			siteTheme,
		);
		expect(ir.entries).toEqual([
			{ conditions: [], prop: "--margin", value: "$spacing-6" },
			{ conditions: [], prop: "marginTop", value: "var(--margin)" },
			{ conditions: ["first"], prop: "marginTop", value: "0" },
		]);
		expect(ir.residuals).toEqual([]);
	});
});

describe("pandaRecipeToIr — mdx/pre.tsx cva", () => {
	const preCvaBody = /* inner object-literal body, braces stripped by matchBlock upstream */ `
		base: {
			position: 'relative',
			mt: { base: '6', _first: '0' },
			bg: 'bg.muted!',
			rounded: 'xl'
		},
		variants: {
			hasFilename: {
				true: { pt: '12', pb: '4' },
				false: { py: '4' }
			}
		},
		defaultVariants: { hasFilename: 'true' }
	`;
	const parsed = parseObjectLiteral(preCvaBody);

	it("parses the literal body", () => {
		expect(parsed).not.toBeNull();
	});

	it("captures base + variants + defaults as slot-keyed IR", () => {
		const recipe = pandaRecipeToIr(parsed!, "cva", siteTheme);
		expect(recipe.kind).toBe("cva");
		expect(recipe.slots).toBeNull();
		expect(Object.keys(recipe.base)).toEqual([""]);
		const baseEntries = recipe.base[""]!.entries;
		expect(baseEntries.map((e) => e.prop)).toContain("marginTop");
		expect(recipe.variants["hasFilename"]?.["true"]?.[""]?.entries.map((e) => e.prop)).toEqual([
			"paddingTop",
			"paddingBottom",
		]);
		expect(recipe.defaultVariants).toEqual({ hasFilename: "true" });
	});
});

describe("pandaRecipeToIr — feature-marquee.section.tsx sva", () => {
	const marqueeSvaBody = /* inner body */ `
		slots: ['root', 'marquee', 'item', 'itemText'],
		base: {
			root: { bg: 'bg', py: '5', textStyle: '2xl', fontWeight: 'semibold' },
			marquee: {
				listStyleType: 'none',
				_motionReduce: { '& .rfm-marquee': { animation: 'none!' } }
			},
			item: { mx: '2', display: 'flex' }
		}
	`;
	const parsed = parseObjectLiteral(marqueeSvaBody);
	const recipe = pandaRecipeToIr(parsed!, "sva", siteTheme);

	it("records slot names", () => {
		expect(recipe.slots).toEqual(["root", "marquee", "item", "itemText"]);
	});

	it("maps root bg to the authored $bg ref and keeps fontWeight", () => {
		const root = recipe.base["root"]!;
		expect(root.entries).toContainEqual({
			conditions: [],
			prop: "backgroundColor",
			value: "$bg",
		});
		expect(root.entries).toContainEqual({ conditions: [], prop: "fontWeight", value: "semibold" });
	});

	it("residuals the unknown preset textStyle ('2xl') inside slots", () => {
		const root = recipe.base["root"]!;
		expect(root.residuals).toHaveLength(1);
		expect(root.residuals[0]!.text).toBe("textStyle: '2xl'");
	});

	it("carries nested selectors per slot (motion-reduced animation)", () => {
		const marquee = recipe.base["marquee"]!;
		expect(marquee.entries).toContainEqual({
			conditions: [],
			prop: "listStyleType",
			value: "none",
		});
		expect(marquee.residuals).toEqual([]);
		expect(marquee.entries).toContainEqual({
			conditions: ["motionReduce", "& .rfm-marquee"],
			prop: "animation",
			value: "none!",
		});
	});
});

describe("pandaRecipeToIr — button.recipe.ts defineRecipe", () => {
	const colorVariant = /* inner body */ `
		className: 'button',
		base: { display: 'flex', paddingX: 6 },
		variants: {
			color: {
				main: { bg: 'bg.emphasized', color: 'black' },
				ghost: { bg: 'transparent', border: 'none' }
			}
		},
		compoundVariants: [
			{ color: ['ghost', 'ghost.white'], size: 'lg', css: { paddingX: '10' } }
		]
	`;

	it("maps variant styles through the same walker", () => {
		const recipe = pandaRecipeToIr(parseObjectLiteral(colorVariant)!, "cva", siteTheme);
		const main = recipe.variants["color"]?.["main"]?.[""];
		expect(main?.entries).toContainEqual({
			conditions: [],
			prop: "backgroundColor",
			value: "$bg-emphasized",
		});
		expect(main?.entries).toContainEqual({ conditions: [], prop: "color", value: "black" });
	});

	it("extracts compound-variant matchers (any-of arrays joined) and css", () => {
		const recipe = pandaRecipeToIr(parseObjectLiteral(colorVariant)!, "cva", siteTheme);
		expect(recipe.compoundVariants).toHaveLength(1);
		const compound = recipe.compoundVariants[0]!;
		expect(compound.matchers).toEqual({ color: "ghost|ghost.white", size: "lg" });
		expect(compound.slots[""]!.entries).toEqual([
			{ conditions: [], prop: "paddingX", value: "10" },
		]);
	});

	it("numbers stay numbers (spacing-scale refs)", () => {
		const recipe = pandaRecipeToIr(parseObjectLiteral(colorVariant)!, "cva", siteTheme);
		const baseEntries = recipe.base[""]!.entries;
		expect(baseEntries).toContainEqual({ conditions: [], prop: "paddingX", value: 6 });
	});

	it("whole-call spreads (anatomy parts()) become dynamic residuals at scan level", () => {
		const source = `const r = defineRecipe({ className: 'b', base: { ...parts({ leftIcon: { marginRight: 3 } }) } });`;
		const calls = parsePandaCalls(source, () => false, { theme: siteTheme });
		expect(calls).toHaveLength(1);
		expect(calls[0]!.recipe?.residuals[0]!.kind).toBe("dynamic");
		expect(calls[0]!.recipe?.base).toEqual({});
	});
});

describe("parsePandaCalls scanning", () => {
	it("finds css/cva/sva calls and tags kinds", () => {
		const source = [
			"import { css, cva, sva } from '@/styled-system/css'",
			"const a = css({ color: 'fg.muted' })",
			"const b = cva({ base: { p: '4' } })",
			"const c = sva({ slots: ['root'], base: { root: { m: '2' } } })",
		].join("\n");
		const calls = parsePandaCalls(source, () => false, { theme: siteTheme });
		expect(calls.map((c) => c.kind)).toEqual(["css", "cva", "sva"]);
		expect(calls[0]!.ir?.entries).toEqual([{ conditions: [], prop: "color", value: "$fg-muted" }]);
		expect(calls[1]!.recipe?.base[""]?.entries).toEqual([
			{ conditions: [], prop: "padding", value: "4" },
		]);
	});

	it("is pure: repeated parsing yields identical IR (idempotency)", () => {
		const source = "const x = css({ mt: { base: '6', _dark: '8' }, bg: 'bg.subtle!' })";
		const a = JSON.stringify(parsePandaCalls(source, () => false, { theme: siteTheme }));
		const b = JSON.stringify(parsePandaCalls(source, () => false, { theme: siteTheme }));
		expect(a).toBe(b);
	});

	it("type-level: recipe IR exposes slots/variants/compoundVariants", () => {
		expectTypeOf<PandaRecipeIR["compoundVariants"]>().toMatchTypeOf<
			Array<{ matchers: Record<string, string>; slots: Record<string, unknown> }>
		>();
	});
});

describe("loadPandaTheme — fixture config (hermetic)", () => {
	const fixturePath = new URL("./fixtures/panda-fixture-config.ts", import.meta.url).pathname;

	it("ingests semanticTokens/tokens with DEFAULT collapse + group-relative paths", async () => {
		const theme = await loadPandaTheme(fixturePath);
		expect(theme.tokenVars.get("fg.muted")).toBe("--colors-fg-muted");
		expect(theme.tokenVars.get("fg")).toBe("--colors-fg"); // DEFAULT collapsed
		expect(theme.tokenVars.get("bg.subtle")).toBe("--colors-bg-subtle");
		// Raw token groups register relative to their own top-level key.
		expect(theme.tokenVars.get("neutral.700")).toBe("--colors-neutral-700");
		// Single-segment scale tokens register bare ('fontSize: \'sm\' resolves).
		expect(theme.tokenVars.get("sm")).toBe("--font-sizes-sm");
	});

	it("ingests namespaced textStyles", async () => {
		const theme = await loadPandaTheme(fixturePath);
		expect(theme.textStyles.has("panda.h4")).toBe(true);
		expect(theme.textStyles.get("panda.h4")).toEqual({
			fontSize: "1.625rem",
			lineHeight: "1.2",
			letterSpacing: "tight",
		});
	});

	it("end-to-end: navbar snippet against the ingested theme", async () => {
		const theme = await loadPandaTheme(fixturePath);
		const ir = pandaStyleToIr({ color: "fg.muted", _hover: { color: "fg.headline" } }, theme);
		expect(ir.residuals).toEqual([]);
		expect(ir.entries).toEqual([
			{ conditions: [], prop: "color", value: "$fg-muted" },
			{ conditions: ["hover"], prop: "color", value: "$fg-headline" },
		]);
	});

	it("prefers Panda's official merged config loader when available", async () => {
		const loader: ProjectModuleLoader = {
			async importPackage(packageName) {
				return packageName === "@pandacss/config"
					? ({
							loadConfig: async () => ({
								config: {
									theme: {
										tokens: { colors: { brand: { value: "#123456" } } },
									},
								},
							}),
						} as never)
					: undefined;
			},
			async importFile() {
				throw new Error("official loader should win before direct config import");
			},
		};
		const theme = await loadPandaTheme("/project/panda.config.ts", loader);
		expect(theme.tokenVars.get("brand")).toBe("--colors-brand");
	});
});

describe("loadPandaTheme — real website panda.config.ts (best-effort)", () => {
	const configPath = `${WEBSITE}/panda.config.ts`;
	it.skipIf(!existsSync(configPath))(
		"resolves when host node_modules exist",
		async () => {
			try {
				const theme = await loadPandaTheme(configPath);
				expect(theme.tokenVars.get("fg.muted")).toBe("--colors-fg-muted");
			} catch (error) {
				const message = (error as Error).message;
				if (message.includes("Cannot find package")) return; // host deps absent — hermetic fixture covers the shape
				throw error;
			}
		},
		30_000,
	);
});
