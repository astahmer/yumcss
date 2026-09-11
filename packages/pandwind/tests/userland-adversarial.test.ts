import type { StandardProperties } from "csstype";
import { describe, expect, test } from "vitest";
import { createCss } from "../src/css/create-css.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { createRuntimeCss } from "../src/css/runtime.ts";
import { createCx } from "../src/cx/index.ts";
import { createHashFn, escapeIdentifier } from "../src/css/hash.ts";
import { createNamedAtomsStrategy } from "../src/css/named-atoms-strategy.ts";
import { definePreset, defineSemanticTokens, defineTokens } from "../src/types/define-preset.ts";
import { examplePreset } from "@pandwind/example-preset";

const conditions = { base: "", _dark: ".dark &" } as const;

const tokenPreset = (() => {
	const raw = defineTokens({
		colors: {
			"$blue-600": "#2b6cb0",
			"$blue-700": "#2c5282",
		},
	});
	const semantic = defineSemanticTokens(conditions, {
		semantic: {
			"bg.primary": {
				base: raw.colors["$blue-600"],
				_dark: raw.colors["$blue-700"],
			},
		},
	});

	return definePreset(
		{
			config: {} as StandardProperties,
			tokens: {
				...raw,
				...semantic,
				component: {
					"component.card.background": {
						base: "semantic.bg.primary",
						_dark: "semantic.bg.primary",
					},
				},
			},
		},
		{
			strict: true,
			conditions,
			properties: {
				$all: true,
				backgroundColor: { $tokens: "component" },
			},
		},
	);
})();

describe("userland adversarial contracts", () => {
	test("used-token extraction retains semantic dependencies of component aliases", () => {
		const css = createCss(tokenPreset);
		const sheet = createStylesheet(tokenPreset, { debug: true }, { tokens: "used" });

		sheet.process([css.raw({ backgroundColor: "component.card.background" })]);

		const output = sheet.generate([]);
		expect(output).toContain("#2b6cb0");
		expect(output).toContain("#2c5282");
	});

	test("base conditions use the same carrier class as the base sheet rule", () => {
		const preset = {
			conditions: { base: "", md: "@media (min-width: 768px)" },
		} as never;
		const css = createCss(preset);
		const output = css.vars({ padding: { base: "4px", md: "12px" } } as never);
		const sheet = createStylesheet(preset);

		sheet.processVarKey("padding__base");
		sheet.processVarKey("padding__md");

		expect(output.class).toContain("pw-padding");
		expect(output.class).not.toContain("pw-base");
		expect(sheet.gen.varRules()).toContain(".pw-padding{");
	});

	test("cx.vars outputs remain composable and serialized carriers remain safe", () => {
		const css = createCss();
		const cx = createCx({ css });
		const first = css.vars({ color: "red" });
		const second = css.vars({ backgroundColor: "blue" });
		const merged = cx.vars(first, second);
		const serialized = JSON.parse(JSON.stringify(first));

		expect(cx.vars(merged, css.vars({ color: "green" }))).toEqual({
			class: "pw-background-color pw-color",
			style: {
				"--pw-c-background-color": "blue",
				"--pw-c-color": "green",
			},
		});
		expect(cx.vars(serialized, second)).toEqual({
			class: "pw-color pw-background-color",
			style: {
				"--pw-c-color": "red",
				"--pw-c-background-color": "blue",
			},
		});
	});

	test("props does not mistake compiled CSS properties named class and style for a vars carrier", () => {
		const css = createCss({ debug: true });
		const output = css.props(
			css({ class: "alpha", style: "beta" } as never),
		);

		expect(output).toEqual({
			className: "class__alpha style__beta",
			style: undefined,
		});
	});

	test("props ignores unsupported primitive inputs instead of using `in` on them", () => {
		const css = createCss({ debug: true });

		expect(css.props(42 as never, Symbol("ignored") as never, css.class({ color: "red" }))).toEqual({
			className: "color__red",
			style: undefined,
		});
	});

	test("multi-argument styles merge sibling condition branches", () => {
		const css = createCss({ debug: true });

		expect(
			css.class(
				{ _hover: { color: "red" } } as never,
				{ _hover: { backgroundColor: "blue" } } as never,
			),
		).toBe("_hover__color__red _hover__backgroundColor__blue");
	});

	test("cx treats inverted and canonical condition nesting as the same atom", () => {
		const css = createCss();
		const cx = createCx({ css });
		const inverted = css.class({ color: { _hover: "red" } } as never);
		const canonical = css.class({ _hover: { color: "blue" } } as never);

		expect(cx(inverted, canonical)).toBe(canonical);
		expect(cx(canonical, inverted)).toBe(inverted);
	});

	test("cx does not alias cached class strings containing the cache delimiter", () => {
		const css = createCss();
		const cx = createCx({ css });
		const first = cx("a\u0000b", "c");
		const second = cx("a", "b\u0000c");

		expect(first).not.toBe(second);
	});

	test("condition selectors keep commas inside attribute values intact", () => {
		const preset = {
			conditions: { state: '[data-label="a,b"] &' },
			properties: { $all: true },
			strict: true,
			tokens: {},
		} as never;
		const css = createCss({ debug: true, conditions: preset.conditions });
		const sheet = createStylesheet(preset, { debug: true });
		const rules = sheet.process([css.raw({ state: { color: "red" } } as never)]);

		expect(rules.values().next().value?.css).toMatch(
			/\[data-label="a,b"\] \.color__state__red\{color:red\}/,
		);
	});

	test("debug class names stay one DOM token for whitespace values", () => {
		const preset = {
			conditions: {},
			properties: { $all: true },
			strict: true,
			tokens: {},
		} as never;
		const style = { border: "1px solid red" } as never;
		const css = createCss({ debug: true });
		const className = css.class(style);
		const sheet = createStylesheet(preset, { debug: true });

		expect(className).not.toMatch(/\s/);
		expect(sheet.generate([style])).toContain(`.${escapeIdentifier(className)}`);
		expect(createHashFn(true)("border", "1px solid red")).toBe(className);
	});

	test("condition paths and values cannot collide through the flat-key separator", () => {
		const preset = {
			conditions: { _hover: "&:hover", zactive: "&:active" },
			properties: { $all: true },
			strict: true,
			tokens: {},
		} as never;
		const first = { _hover: { color: "zactive__blue" } } as never;
		const second = { _hover: { zactive: { color: "blue" } } } as never;
		const css = createCss({ debug: false, conditions: preset.conditions });
		const firstClass = css.class(first);
		const secondClass = css.class(second);
		const sheet = createStylesheet(preset);

		expect(firstClass).not.toBe(secondClass);
		expect(sheet.process([css.raw(first), css.raw(second)])).toHaveLength(2);
		expect(sheet.gen.atomic()).toContain(`${escapeIdentifier(firstClass)}:hover{color:zactive__blue}`);

		const runtime = createRuntimeCss(preset, { sheetOptions: { autoMount: false } });
		runtime.class(first);
		expect(runtime.sheet.css()).toContain(`:hover{color:zactive__blue}`);
	});

	test("non-finite numeric values never become invalid CSS declarations", () => {
		const preset = {
			conditions: {},
			properties: { $all: true },
			strict: true,
			tokens: {},
		} as never;
		const style = {
			opacity: Number.NaN,
			width: Number.POSITIVE_INFINITY,
			zIndex: Number.NEGATIVE_INFINITY,
		} as never;
		const css = createCss({ debug: true });
		const sheet = createStylesheet(preset, { debug: true });

		expect(css(style)).toEqual({});
		expect(sheet.generate([style])).toBe("");
	});

	test("unsupported primitive values are ignored instead of crashing the CSS backend", () => {
		const preset = {
			conditions: {},
			properties: { $all: true },
			strict: true,
			tokens: {},
		} as never;
		const style = {
			display: false,
			visibility: true,
			content: Symbol("runtime"),
		} as never;
		const css = createCss({ debug: true });
		const sheet = createStylesheet(preset, { debug: true });

		expect(css(style)).toEqual({});
		expect(sheet.generate([style])).toBe("");
	});

	test("hostile property names do not mutate object prototypes", () => {
		const style = Object.create(null) as Record<string, unknown>;
		Object.defineProperty(style, "__proto__", {
			enumerable: true,
			value: "red",
		});
		style.constructor = "blue";

		const css = createCss({ debug: true });
		const compiled = css(style as never);
		const raw = css.raw(style as never);

		expect(Object.hasOwn(compiled, "__proto__")).toBe(true);
		expect(Object.hasOwn(raw, "__proto__")).toBe(true);
		expect(Object.getPrototypeOf(compiled)).toBeNull();
		expect(Object.getPrototypeOf(raw)).toBeNull();
		expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
	});

	test("group compilation ignores unsupported static values like the main compiler", () => {
		const css = createCss({ debug: true });
		const groups = css.group({
			button: {
				padding: 4,
				content: Symbol("unsupported"),
				opacity: Number.NaN,
			} as never,
		});

		expect(groups.button).toEqual({ padding: "padding__4px" });
	});

	test("var rules match inverted selector nesting", () => {
		const preset = {
			conditions: { _hover: "&:hover" },
			properties: { $all: true },
			strict: true,
			tokens: {},
		} as never;
		const css = createCss({ conditions: preset.conditions });
		const output = css.vars({ color: { "&:hover": "red" } } as never);
		const sheet = createStylesheet(preset);
		sheet.processVarKey("color__&:hover");

		expect(sheet.gen.varRules()).toContain(`.${output.class.replaceAll(":", "\\:")}`);
		expect(sheet.gen.varRules()).toContain("color: var(--pw-c-color_selector-");
	});

	test("stylesheet normalization uses the property after canonicalizing nesting", () => {
		const preset = {
			conditions: { _hover: "&:hover" },
			properties: { $all: true },
			strict: true,
			tokens: {},
		} as never;
		const sheet = createStylesheet(preset);

		const output = sheet.generate([
			{ lineHeight: { _hover: 1.2 } } as never,
		]);

		expect(output).toContain("line-height:1.2");
		expect(output).not.toContain("line-height:1.2px");
	});

	test("unknown semantic token conditions fail instead of becoming root values", () => {
		const preset = {
			conditions: { base: "" },
			properties: { $all: true },
			strict: true,
			tokens: {
				semantic: { surface: { typo: "#ffffff" } },
			},
		} as never;

		expect(() => createStylesheet(preset)).toThrow("Unknown condition 'typo'");
		expect(() => createRuntimeCss(preset, { sheetOptions: { autoMount: false } })).toThrow(
			"Unknown condition 'typo'",
		);
	});

	test("inherited style properties are not compiled as authored declarations", () => {
		const inherited = { color: "red" };
		const style = Object.assign(Object.create(inherited), { padding: 4 }) as never;
		const css = createCss({ debug: true });

		expect(css(style)).toEqual({ padding: "padding__4px" });
	});

	test("inherited preset properties do not become runtime tokens", () => {
		const inherited = { color: { inherited: "red" } };
		const preset = {
			conditions: {},
			properties: Object.assign(Object.create(inherited), {
				color: { own: "blue" },
			}),
			strict: true,
			tokens: {},
		} as never;
		const runtime = createRuntimeCss(preset, { sheetOptions: { autoMount: false } });

		expect(runtime.class({ color: "inherited" } as never)).toMatch(/^[a-z0-9]+$/);
		expect(runtime.sheet.css()).toContain("color:inherited");
	});

	test("sheet-backed named atoms stay usable as DOM classes", () => {
		const preset = {
			conditions: {},
			properties: { $all: true },
			strict: true,
			tokens: {},
		} as never;
		const strategy = createNamedAtomsStrategy();
		const style = { color: "$blue-500" } as never;
		const css = createCss({ className: strategy });
		const className = css.class(style);
		const sheet = createStylesheet(preset, { className: strategy });

		expect(className).toBe("pw-color-$blue-500");
		expect(sheet.generate([style])).toContain(`.${escapeIdentifier(className)}`);

		const whitespaceClass = css.class({ color: "red blue" } as never);
		expect(whitespaceClass).not.toMatch(/\s/);
	});

	test("implicit runtime sheets do not mix different preset token scopes", () => {
		Reflect.deleteProperty(globalThis, Symbol.for("pandwind.runtime.default-sheet"));
		const firstPreset = definePreset(
			{
				config: {} as StandardProperties,
				tokens: { colors: { "$brand": "#111111" } },
			},
			{
				strict: true,
				conditions: { base: "" },
				properties: { color: { $tokens: "colors" } },
			},
		);
		const secondPreset = definePreset(
			{
				config: {} as StandardProperties,
				tokens: { colors: { "$brand": "#eeeeee" } },
			},
			{
				strict: true,
				conditions: { base: "" },
				properties: { color: { $tokens: "colors" } },
			},
		);

		const first = createRuntimeCss(firstPreset);
		first.class({ color: "$brand" });
		const second = createRuntimeCss(secondPreset);
		second.class({ color: "$brand" });

		expect(first.sheet).not.toBe(second.sheet);
		expect(first.sheet.css()).toContain("#111111");
		expect(second.sheet.css()).toContain("#eeeeee");
	});

	test("external runtime class strategies do not register duplicate Pandwind rules", () => {
		const sheet = createRuntimeCss(examplePreset, {
			className: {
				name: "external",
				toClassName: (key, value) => `external-${key}-${value}`,
			},
			sheetOptions: { autoMount: false },
		});

		expect(sheet.class({ color: "red" })).toBe("external-color-red");
		expect(sheet.sheet.snapshot().rules).toHaveLength(0);
	});

	test("semantic runtime selectors compose attribute and parent conditions", () => {
		const sheet = createRuntimeCss(examplePreset, { sheetOptions: { autoMount: false } }).sheet;

		sheet.registerSemanticRules([
			{
				kind: "style",
				selector: ".item",
				conditions: ["[data-state=checked]"],
				declarations: [{ property: "color", value: "red" }],
			},
			{
				kind: "style",
				selector: ".item",
				conditions: ['[data-theme="dark"] &'],
				declarations: [{ property: "color", value: "white" }],
			},
		]);

		expect(sheet.css()).toContain(".item[data-state=checked]{color:red}");
		expect(sheet.css()).toContain('[data-theme="dark"] .item{color:white}');
	});
});
