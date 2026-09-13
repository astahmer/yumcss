/**
 * Var-inline strategy (plans/014 §1): `css.vars()` encodes dynamic VALUES as
 * deterministic classes + inline custom properties; the generated sheet
 * carries toggle rules with fallback chains. Values never enter any CSS.
 *
 * Layers proven here: encoding (unit), cx/cx.vars threading (differential),
 * sheet generation (unit) and the whole thing against REAL Tailwind
 * compilation (spike pattern, but fed by OUR generator output).
 */
import { compile } from "@tailwindcss/node";
import { parse } from "postcss";
import type { StandardProperties } from "csstype";
import { describe, expect, test } from "vitest";
import { createCss, createCssOpen } from "../src/css/create-css.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { cssShorthands } from "../src/css/shorthands.ts";
import { VARS_ATOMS } from "../src/css/var-compiler.ts";
import { createCx } from "../src/cx/index.ts";
import { createDesignCss } from "../src/design/index.ts";
import { definePreset } from "../src/types/define-preset.ts";
import { createCssSourceScanner } from "../src/vite/css-extract.ts";

const css = createCss();
const shorthandCss = createCss({ propertyAliases: cssShorthands });
const responsiveCss = createCss({
	conditions: { md: "@media (min-width: 768px)" },
} as never);
const responsivePreset = {
	conditions: { md: "@media (min-width: 768px)" },
} as never;
const examplePreset = {
	conditions: {
		_hover: "&:hover",
		_focus: "&:focus",
		_dark: ".dark &",
	},
} as never;

const varsPreset = definePreset(
	{
		config: {} as StandardProperties,
		tokens: {
			colors: { $brand: "#123456" },
			sizes: { full: "100%" },
		},
	},
	{
		strict: true,
		conditions: { _hover: "&:hover" },
		properties: {
			color: { $tokens: "colors", $strictness: "inherits" },
			width: { $tokens: "sizes", $strictness: "inherits" },
		},
	},
);

describe("css.vars — encoding", () => {
	test("preset-bound vars resolve token names while preserving raw CSS values", () => {
		const css = createCss(varsPreset, { debug: true });
		const output = css.vars({ color: "$brand", width: "100%", _hover: { color: "red" } });

		expect(output.style["--pw-c-color"]).toMatch(/^var\(--/u);
		expect(output.style["--pw-c-color"]).not.toBe("$brand");
		expect(output.style).toMatchObject({
			"--pw-c-width": "100%",
			"--pw-c-color_hover": "red",
		});
	});

	test("open preset factory keeps runtime properties while resolving preset tokens", () => {
		const css = createCssOpen(varsPreset, { debug: true });
		const output = css.vars({ color: "$brand", arbitraryProperty: "value" });

		expect(output.style).toMatchObject({
			"--pw-c-color": expect.stringMatching(/^var\(--/u),
			"--pw-c-arbitrary-property": "value",
		});
	});

	test("uses an explicit namespace for carriers and custom properties", () => {
		const namespaced = createCss({ namespace: "checkout" });
		const out = namespaced.vars({ color: "red", _hover: { color: "blue" } });

		expect(out.class).toBe("checkout-hover:color checkout-color");
		expect(out.style).toEqual({
			"--checkout-c-color": "red",
			"--checkout-c-color_hover": "blue",
		});
	});

	test("does not rewrite caller-owned class-name strategies", () => {
		const css = createCss({
			namespace: "checkout",
			className: {
				name: "owned",
				toClassName: (key) => `owned-${key}`,
			},
		});

		expect(css.class({ color: "red" })).toBe("owned-color");
		expect(css.vars({ color: "red" }).class).toBe("checkout-color");
	});

	test("base value becomes a class + one custom property", () => {
		const out = css.vars({ color: "red" });
		expect(out.class).toBe("pw-color");
		expect(out.style).toEqual({ "--pw-c-color": "red" });
	});

	test("simple camelCase properties keep their normalized carrier", () => {
		const out = css.vars({ backgroundColor: "#123456" });
		expect(out.class).toBe("pw-background-color");
		expect(out.style).toEqual({ "--pw-c-background-color": "#123456" });
	});

	test("configured aliases normalize variable carriers", () => {
		const out = shorthandCss.vars({ bg: "red" });

		expect(out.class).toBe("pw-background");
		expect(out.style).toEqual({ "--pw-c-background": "red" });
	});

	test("nested conditions encode into the class and suffixed props", () => {
		const out = css.vars({ _hover: { color: "blue" } });
		expect(out.class).toBe("pw-hover:color");
		expect(out.style).toEqual({ "--pw-c-color_hover": "blue" });
	});

	test("mixed base + conditional yields both atoms and both props", () => {
		const out = css.vars({ color: "red", _hover: { color: "blue" } });
		expect(out.class).toBe("pw-hover:color pw-color"); // canonical sorted-key order
		expect(out.style).toEqual({
			"--pw-c-color": "red",
			"--pw-c-color_hover": "blue",
		});
	});

	test("deep condition paths join deterministically", () => {
		const out = css.vars({ _dark: { _hover: { color: "x" } } });
		expect(out.class).toBe("pw-dark:hover:color");
		expect(out.style).toEqual({ "--pw-c-color_dark_hover": "x" });
	});

	test("responsive values use the same canonical key as the stylesheet", () => {
		const out = responsiveCss.vars({ paddingLeft: { md: "12" } } as never);
		expect(out.class).toBe("pw-md:padding-left");
		expect(out.style).toEqual({ "--pw-c-padding-left_md": "12" });
	});

	test("finite numbers are serialized for SSR-safe inline styles", () => {
		const out = css.vars({ opacity: 0.5, zIndex: -2 } as never);
		expect(out.style).toEqual({ "--pw-c-opacity": "0.5", "--pw-c-z-index": "-2" });
		expect(JSON.parse(JSON.stringify(out))).toEqual({
			class: "pw-opacity pw-z-index",
			style: { "--pw-c-opacity": "0.5", "--pw-c-z-index": "-2" },
		});
	});

	test("invalid and structural values are omitted instead of becoming CSS", () => {
		const out = css.vars({
			opacity: Number.NaN,
			zIndex: Number.POSITIVE_INFINITY,
			color: true,
			fontFamily: "",
		} as never);
		expect(out.class).toBe("");
		expect(out.style).toEqual({});
	});

	test("carrier metadata is embedded for cx recognition", () => {
		const out = css.vars({ color: "red" });
		expect(VARS_ATOMS in out).toBe(true);
	});
});

describe("cx / cx.vars — carrier threading (differential)", () => {
	test("plain cx keeps its string return type and DROPS styles", () => {
		const cx = createCx();
		const out = cx(css.vars({ color: "red" }), "text-sm");
		expect(out).toContain("pw-color");
		expect(out).toContain("text-sm");
	});

	test("cx.vars merges classes AND carries inline styles", () => {
		const cx = createCx();
		const merged = cx.vars(css.vars({ color: "red" }), css.vars({ fontSize: "12px" }));
		expect(merged.class).toContain("pw-color");
		expect(merged.class).toContain("pw-font-size");
		expect(merged.style).toEqual({
			"--pw-c-color": "red",
			"--pw-c-font-size": "12px",
		});
	});

	test("same property: later input wins for class AND style", () => {
		const cx = createCx();
		const first = css.vars({ color: "red" });
		const second = css.vars({ color: "blue" });
		const merged = cx.vars(first, second);
		// Identical keys -> identical classes; last-wins keeps exactly one:
		expect(merged.class).toBe(second.class);
		expect(merged.style).toEqual({ "--pw-c-color": "blue" });
	});

	test("different condition scopes coexist (variant parity with tw)", () => {
		const cx = createCx();
		const merged = cx.vars(css.vars({ color: "red" }), css.vars({ _hover: { color: "blue" } }));
		expect(merged.class).toContain("pw-color");
		expect(merged.class).toContain("pw-hover:color");
	});
});

describe("sheet generation", () => {
	test("toggle rules carry fallback chains across prefixes", () => {
		const sheet = createStylesheet(examplePreset as never);
		sheet.processVarKey("_hover__color");
		const cssText = sheet.gen.varRules();
		expect(cssText).toContain(".pw-hover\\:color:hover");
		expect(cssText).toContain("color: var(--pw-c-color_hover, var(--pw-c-color))");
	});

	test("stylesheet var rules use the same explicit namespace", () => {
		const sheet = createStylesheet(examplePreset as never, { namespace: "checkout" });
		sheet.processVarKey("_hover__color");
		const cssText = sheet.gen.varRules();

		expect(cssText).toContain(".checkout-hover\\:color:hover");
		expect(cssText).toContain("color: var(--checkout-c-color_hover, var(--checkout-c-color))");
	});

	test("_dark resolves through the preset condition (.dark &)", () => {
		const sheet = createStylesheet(examplePreset as never);
		sheet.processVarKey("_dark__background-color");
		const cssText = sheet.gen.varRules();
		expect(cssText).toContain(".dark");
		expect(cssText).toContain("--pw-c-background-color_dark");
	});

	test("property-first responsive keys preserve the property in the declaration", () => {
		const sheet = createStylesheet(responsivePreset);
		sheet.processVarKey("padding-left__md");
		expect(sheet.gen.varRules()).toContain(
			"@media (min-width: 768px){.pw-md\\:padding-left{padding-left:",
		);
	});

	test("configured aliases normalize variable toggle declarations", () => {
		const sheet = createStylesheet(examplePreset as never, { propertyAliases: cssShorthands });
		sheet.processVarKey("_hover__bg");

		expect(sheet.gen.varRules()).toContain(
			"background: var(--pw-c-background_hover, var(--pw-c-background))",
		);
	});

	test("rules are deduped across repeated processing", () => {
		const sheet = createStylesheet(examplePreset as never);
		sheet.processVarKey("color");
		sheet.processVarKey("color");
		expect(sheet.gen.varRules().match(/\.pw-color\b/g)).toHaveLength(1);
	});
});

describe("real-Tailwind proof — generator output end to end", () => {
	test("classes compile through real Tailwind; values stay out of the sheet", async () => {
		// Build the sheet from OUR generator for the combos used.
		const sheet = createStylesheet(examplePreset as never);
		for (const key of ["color", "_hover__color"]) sheet.processVarKey(key);
		const varSheet = sheet.gen.varRules();

		const entry = `@theme {\n\t--color-blue-500: #3b82f6;\n}\n${varSheet}\n`;
		const compiled = await compile(entry, { base: import.meta.dirname, onDependency: () => {} });
		const root = parse(compiled.build(["pw-color", "pw-hover:color"]));

		const decls: Array<string> = [];
		let literalValueSeen = false;
		root.walkRules((rule) => {
			rule.walkDecls("color", (decl) => {
				decls.push(`${rule.selector} :: ${decl.value}`);
				if (!decl.value.startsWith("var(")) literalValueSeen = true;
			});
		});
		expect(decls.some((d) => d.startsWith(".pw-color ::"))).toBe(true);
		expect(decls.some((d) => d.includes(".pw-hover\\:color:hover"))).toBe(true);
		// Every emitted declaration must be pure var() chains — the concrete
		// VALUE ("red"/"blue") only ever exists in the element's inline style.
		expect(literalValueSeen).toBe(false);
	}, 30_000);

	test("inline style + generated sheet compose to the final value", async () => {
		const sheet = createStylesheet(examplePreset as never);
		sheet.processVarKey("_hover__color");
		const varSheet = sheet.gen.varRules();

		const entry = `@theme {\n\t--color-blue-500: #3b82f6;\n}\n${varSheet}\n`;
		const compiled = await compile(entry, { base: import.meta.dirname, onDependency: () => {} });

		// Simulate an element carrying css.vars' inline style:
		const elementCss = `.el { --pw-c-color: #ff0000; --pw-c-color_hover: #0000ff; }\n${compiled.build(["pw-hover:color"])}`;
		const root = parse(elementCss);
		const values: Array<string> = [];
		root.walkDecls("color", (decl) => {
			values.push(decl.value);
		});
		// The toggle rule resolves through BOTH inline-provided vars:
		expect(values).toContainEqual("var(--pw-c-color_hover, var(--pw-c-color))");
	}, 30_000);
});

describe("design layer passthrough", () => {
	test("createDesignCss exposes .vars resolving $tokens first", async () => {
		const { examplePreset: preset } = await import("@pandwind/example-preset");
		const dss = createDesignCss(preset as never);
		const out = dss.vars({ $text: { color: "$blue-500" } } as never);
		expect(out.class).toContain("pw-color");
		expect(Object.values(out.style)).toContain("#3182ce");
	});
});

describe("vite pass — css.vars key collection feeds the sheet", () => {
	test("extractVarKeys finds literal vars() keys; dynamic structures skipped", async () => {
		const scanner = createCssSourceScanner([]);
		const code = `
			import { css } from "./design";
			export const a = css.vars({ color: dynamicValue, _hover: { color: other } });
			export const b = css.class({ color: "#fff" });
		`;
		// `dynamicValue`/`other` are identifiers — evalLiteral skips them,
		// so the structure is only partially static; keys from the static
		// nesting still register.
		const keys = scanner.findVarKeys(code, "app.ts", new Set(["css"]));
		expect(keys).toContain("_hover__color");
	});
});
