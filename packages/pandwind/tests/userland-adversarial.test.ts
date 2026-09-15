import type { StandardProperties } from "csstype";
import { describe, expect, test } from "vitest";
import { createCss } from "../src/css/create-css.ts";
import { createUnsafeCss } from "../src/unsafe/css.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { createRuntimeCss } from "../src/css/runtime.ts";
import { createRuntimeSheet, type RuntimeSemanticRule } from "../src/css/runtime-sheet.ts";
import { createDesignCss } from "../src/design/index.ts";
import { createCx } from "../src/cx/index.ts";
import { createHashFn, escapeIdentifier } from "../src/css/hash.ts";
import { createNamedAtomsStrategy } from "../src/css/named-atoms-strategy.ts";
import { define } from "../src/types/define-preset.ts";
import { examplePreset } from "@pandwind/example-preset";

const conditions = { base: "", _dark: ".dark &" } as const;

const tokenPreset = (() => {
	const raw = define.tokens({
		colors: {
			"$blue-600": "#2b6cb0",
			"$blue-700": "#2c5282",
		},
	});
	const semantic = raw.defineSemanticTokens(conditions, {
		semantic: {
			"bg.primary": {
				base: raw.colors["$blue-600"],
				_dark: raw.colors["$blue-700"],
			},
		},
	});

	return define.preset(
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
		const conditions = { base: "", md: "@media (min-width: 768px)" };
		const preset = { conditions } as never;
		const css = createUnsafeCss({ conditions });
		const output = css.vars({ padding: { base: "4px", md: "12px" } } as never);
		const sheet = createStylesheet(preset);

		sheet.processVarKey("padding__base");
		sheet.processVarKey("padding__md");

		expect(output.class).toContain("pw-padding");
		expect(output.class).not.toContain("pw-base");
		expect(sheet.gen.varRules()).toContain(".pw-padding{");
	});

	test("prepared stylesheet inputs canonicalize inverted paths", () => {
		const preset = {
			conditions: { _hover: "&:hover" },
		} as never;
		const sheet = createStylesheet(preset);

		const rules = sheet.processPrepared([
			{ key: "color___hover", value: "red" },
			{ key: "padding", value: "4" },
		]);
		const css = [...rules.values()].map((rule) => rule.css).join("\n");

		expect(css).toContain(":hover{color:red}");
		expect(css).toContain("padding:4");
	});

	test("cx.vars outputs remain composable and serialized carriers remain safe", () => {
		const css = createUnsafeCss();
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
		const css = createUnsafeCss({ debug: true });
		const output = css.props(css({ class: "alpha", style: "beta" } as never));

		expect(output).toEqual({
			className: "class__alpha style__beta",
			style: undefined,
		});
	});

	test("props ignores unsupported primitive inputs instead of using `in` on them", () => {
		const css = createUnsafeCss({ debug: true });

		expect(css.props(42 as never, Symbol("ignored") as never, css.class({ color: "red" }))).toEqual(
			{
				className: "color__red",
				style: undefined,
			},
		);
	});

	test("style projections fail closed for malformed top-level values", () => {
		const css = createUnsafeCss({ debug: true });

		expect(css(null as never)).toEqual({});
		expect(css.class(null as never)).toBe("");
		expect(css("not-a-style-object" as never)).toEqual({});
		expect(css.raw("not-a-style-object" as never)).toEqual({});
		expect(css.vars("not-a-style-object" as never)).toEqual({ class: "", style: {} });
	});

	test("cyclic style objects terminate without recursive overflow", () => {
		const css = createUnsafeCss({ debug: true });
		const style = { color: "red" } as Record<string, unknown>;
		style.nested = style;

		expect(() => css.class(style as never)).not.toThrow();
		expect(css.class(style as never)).toBe("color__red");
	});

	test("vars carriers require own host fields", () => {
		const css = createUnsafeCss();
		const cx = createCx({ css });
		const inherited = Object.create({
			class: "inherited-class",
			style: { "--inherited": "red" },
		});

		expect(css.props(inherited as never)).toEqual({
			className: undefined,
			style: undefined,
		});
		expect(cx.vars(inherited as never)).toEqual({ class: "", style: {} });
	});

	test("empty CSS values fail closed across static and stylesheet paths", () => {
		const style = { color: "", padding: 4 } as never;
		const css = createUnsafeCss({ debug: true });
		const sheet = createStylesheet(
			{
				conditions: {},
				properties: { $all: true },
				strict: true,
				tokens: {},
			} as never,
			{ debug: true },
		);

		expect(css(style)).toEqual({ padding: "padding__4px" });
		expect(css.class(style)).toBe("padding__4px");
		expect(sheet.generate([style])).toContain("padding:4px");
		expect(sheet.generate([style])).not.toContain("color:");
	});

	test("stylesheet inspection methods ignore malformed prepared entries", () => {
		const preset = {
			conditions: {},
			properties: { $all: true },
			strict: true,
			tokens: {},
		} as never;
		const sheet = createStylesheet(preset);

		expect(() => sheet.processPrepared([{ key: "", value: "" }] as never)).not.toThrow();
		expect(sheet.gen.atomic()).toBe("");
		expect(sheet.processVarKey("" as never)).toBeUndefined();
	});

	test("runtime sheets ignore malformed rules and snapshots at their boundary", () => {
		const sheet = createRuntimeSheet({ autoMount: false });

		expect(() =>
			sheet.register([
				null,
				{ id: "", css: ".broken{}", priority: 0 },
				{ id: "valid", css: ".valid{}", priority: 0 },
			] as never),
		).not.toThrow();
		expect(sheet.css()).toBe(".valid{}");

		expect(() =>
			sheet.registerSemanticRules([
				{ kind: "style", declarations: "bad" },
				{ kind: "style", children: [null] },
			] as never),
		).not.toThrow();
		expect(sheet.css()).toBe(".valid{}");

		expect(() => sheet.hydrate({ tokens: null, rules: [null] } as never)).not.toThrow();
		expect(sheet.css()).toBe(".valid{}");

		sheet.register([
			{ id: "bad-id", css: ".bad\u0000{}", priority: 0 },
			{ id: "bad-css", css: ".bad\u0000{}", priority: 0 },
		] as never);
		sheet.setTokens("\u0000" as never);
		expect(sheet.css()).toBe(".valid{}");
	});

	test("css props flatten nested and cyclic carriers safely", () => {
		const css = createUnsafeCss();
		const colorClass = css.class({ color: "red" });
		const paddingClass = css.class({ padding: 4 });
		const nested: unknown[] = [colorClass, [paddingClass]];
		nested.push(nested);

		expect(() => css.props(nested as never)).not.toThrow();
		expect(css.props(nested as never).className).toBe(`${colorClass} ${paddingClass}`);
	});

	test("cx rejects NUL-bearing class strings", () => {
		const cx = createCx();
		expect(cx("good\u0000bad" as never)).toBe("");
		expect(cx(["good", "bad\u0000class"] as never)).toBe("good");
	});

	test("runtime sheet registration handles deeply nested semantic rules", () => {
		const depth = 10_000;
		let child: RuntimeSemanticRule = {
			kind: "style",
			selector: ".leaf",
			declarations: [{ property: "color", value: "red" }],
		};
		for (let index = 0; index < depth; index++) {
			child = {
				kind: "layer",
				name: `layer-${index}`,
				children: [child],
			};
		}

		const sheet = createRuntimeSheet({ autoMount: false });
		expect(() => sheet.registerSemanticRules([child])).not.toThrow();
		expect(sheet.css()).toContain(".leaf{color:red}");
	});

	test("runtime sheet ignores cyclic semantic rule trees", () => {
		const cycle = { kind: "layer" as const, name: "cycle", children: [] as RuntimeSemanticRule[] };
		cycle.children.push(cycle);

		const sheet = createRuntimeSheet({ autoMount: false });
		expect(() => sheet.registerSemanticRules([cycle])).not.toThrow();
		expect(sheet.css()).toBe("");
	});

	test("design resolution ignores malformed module values instead of throwing", () => {
		const dss = createDesignCss(examplePreset, { debug: true });

		expect(() =>
			dss.class({
				$frame: {
					border: null,
					blurBg: Number.NaN,
					z: Number.POSITIVE_INFINITY,
				},
				$text: {
					spacing: null,
					decoration: null,
					highlight: null,
				},
				$layout: { cols: Number.NaN, rows: Number.POSITIVE_INFINITY },
			} as never),
		).not.toThrow();
		expect(
			dss.class({
				$frame: { border: null, blurBg: Number.NaN, z: Number.POSITIVE_INFINITY },
				$text: { spacing: null, decoration: null, highlight: null },
				$layout: { cols: Number.NaN, rows: Number.POSITIVE_INFINITY },
			} as never),
		).toBe("");

		expect(
			dss.class({
				$frame: {
					border: { color: "", width: Number.NaN, style: "invalid" },
					blurBg: -1,
					overflow: "invalid",
					opacity: 101,
				},
				$text: {
					align: "invalid",
					decoration: { type: "invalid", style: "invalid" },
				},
			} as never),
		).toBe("");
	});

	test("cyclic design styles terminate without recursive overflow", () => {
		const dss = createDesignCss(examplePreset, { debug: true });
		const style = { _hover: {} } as Record<string, unknown>;
		style._hover = style;

		expect(() => dss.class(style as never)).not.toThrow();
		expect(dss.class(style as never)).toBe("");
	});

	test("multi-argument styles merge sibling condition branches", () => {
		const css = createUnsafeCss({ debug: true });

		expect(
			css.class(
				{ _hover: { color: "red" } } as never,
				{ _hover: { backgroundColor: "blue" } } as never,
			),
		).toBe("_hover__color__red _hover__backgroundColor__blue");
	});

	test("cx treats inverted and canonical condition nesting as the same atom", () => {
		const css = createUnsafeCss();
		const cx = createCx({ css });
		const inverted = css.class({ color: { _hover: "red" } } as never);
		const canonical = css.class({ _hover: { color: "blue" } } as never);

		expect(cx(inverted, canonical)).toBe(canonical);
		expect(cx(canonical, inverted)).toBe(inverted);
	});

	test("custom condition names remain mergeable when they sort after the property", () => {
		const customConditions = { z: "&:hover" } as const;
		const css = createUnsafeCss({ conditions: customConditions, debug: true });
		const cx = createCx({ css });
		const first = css.class({ z: { color: "red" } } as never);
		const second = css.class({ z: { color: "blue" } } as never);

		expect(first).toBe("z__color__red");
		expect(second).toBe("z__color__blue");
		expect(cx(first, second)).toBe(second);

		const base = css.vars({ color: "black" } as never);
		const hovered = css.vars({ color: { z: "white" } } as never);
		const merged = cx.vars(base, hovered);
		expect(merged.class).toBe("pw-color pw-z:color");
	});

	test("cx does not alias cached class strings containing the cache delimiter", () => {
		const css = createUnsafeCss();
		const cx = createCx({ css });
		const first = cx("a\u0000b", "c");
		const second = cx("a", "b\u0000c");

		expect(first).not.toBe(second);
	});

	test("cx flattens deeply nested and cyclic input arrays without recursion", () => {
		const cx = createCx();
		const nested: unknown[] = ["first", ["second", false]];
		nested.push(nested);

		expect(cx(nested as never)).toBe("first second");
	});

	test("condition selectors keep commas inside attribute values intact", () => {
		const conditions = { state: '[data-label="a,b"] &' } as const;
		const preset = {
			conditions,
			properties: { $all: true },
			strict: true,
			tokens: {},
		} as never;
		const css = createUnsafeCss({ debug: true, conditions });
		const sheet = createStylesheet(preset, { debug: true });
		const rules = sheet.process([css.raw({ state: { color: "red" } } as never)]);

		expect(rules.values().next().value?.css).toMatch(
			/\[data-label="a,b"\] \.state__color__red\{color:red\}/,
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
		const css = createUnsafeCss({ debug: true });
		const className = css.class(style);
		const sheet = createStylesheet(preset, { debug: true });

		expect(className).not.toMatch(/\s/);
		expect(sheet.generate([style])).toContain(`.${escapeIdentifier(className)}`);
		expect(createHashFn(true)("border", "1px solid red")).toBe(className);
	});

	test("condition paths and values cannot collide through the flat-key separator", () => {
		const conditions = { _hover: "&:hover", zactive: "&:active" } as const;
		const preset = {
			conditions,
			properties: { $all: true },
			strict: true,
			tokens: {},
		} as never;
		const first = { _hover: { color: "zactive__blue" } } as never;
		const second = { _hover: { zactive: { color: "blue" } } } as never;
		const css = createUnsafeCss({ debug: false, conditions });
		const firstClass = css.class(first);
		const secondClass = css.class(second);
		const sheet = createStylesheet(preset);

		expect(firstClass).not.toBe(secondClass);
		expect(sheet.process([css.raw(first), css.raw(second)])).toHaveLength(2);
		expect(sheet.gen.atomic()).toContain(
			`${escapeIdentifier(firstClass)}:hover{color:zactive__blue}`,
		);

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
		const css = createUnsafeCss({ debug: true });
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
		const css = createUnsafeCss({ debug: true });
		const sheet = createStylesheet(preset, { debug: true });

		expect(css(style)).toEqual({});
		expect(sheet.generate([style])).toBe("");
	});

	test("internal delimiters in authored paths and CSS values fail closed", () => {
		const preset = {
			conditions: {},
			properties: { $all: true },
			strict: true,
			tokens: {},
		} as never;
		const css = createUnsafeCss({ debug: true });
		const sheet = createStylesheet(preset, { debug: true });

		expect(css({ background__color: "red" } as never)).toEqual({});
		expect(sheet.generate([{ background__color: "red" } as never])).toBe("");
		expect(css({ color: "red\u0000blue" } as never)).toEqual({});
		expect(css.vars({ color: "red\u0000blue" } as never)).toEqual({
			class: "",
			style: {},
		});
		expect(css({ "": "red" } as never)).toEqual({});
		expect(sheet.generate([{ "": "red" } as never])).toBe("");
	});

	test("hostile property names do not mutate object prototypes", () => {
		const style = Object.create(null) as Record<string, unknown>;
		Object.defineProperty(style, "__proto__", {
			enumerable: true,
			value: "red",
		});
		Object.defineProperty(style, "constructor", { enumerable: true, value: "blue" });

		const css = createUnsafeCss({ debug: true });
		const compiled = css(style as never);
		const raw = css.raw(style as never);

		expect(Object.hasOwn(compiled, "__proto__")).toBe(false);
		expect(Object.hasOwn(compiled, "constructor")).toBe(true);
		expect(Object.hasOwn(raw, "__proto__")).toBe(true);
		expect(Object.getPrototypeOf(compiled)).toBeNull();
		expect(Object.getPrototypeOf(raw)).toBeNull();
		expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
	});

	test("group compilation ignores unsupported static values like the main compiler", () => {
		const css = createUnsafeCss({ debug: true });
		const groups = css.group({
			button: {
				padding: 4,
				content: Symbol("unsupported"),
				opacity: Number.NaN,
			} as never,
		});

		expect(groups.button).toEqual({ padding: "padding__4px" });
	});

	test("dynamic group inputs stay within the declared CSS-variable contract", () => {
		const css = createUnsafeCss({ debug: true });
		expect(() => css.input("" as never)).toThrow(/CSS-safe identifiers/);
		expect(() => css.input("bad name" as never)).toThrow(/CSS-safe identifiers/);

		const groups = css.group({
			card: {
				$input: { color: {} as string },
				color: css.input("color"),
			},
		});
		const output = groups.card({ color: "red", extra: "blue" } as never);

		expect(output.style).toEqual({ "--color": "red" });
		expect(css.props(output).style).toEqual({ "--color": "red" });
		expect(groups.card(null as never).style).toEqual({});
		expect(css.group(null as never)).toEqual({});
	});

	test("group definitions tolerate hostile names and malformed runtime values", () => {
		const css = createUnsafeCss({ debug: true });
		const groups = Object.create(null) as Record<string, unknown>;
		Object.defineProperty(groups, "__proto__", {
			enumerable: true,
			value: { color: "red" },
		});
		groups.invalid = 42;

		const compiled = css.group(groups as never) as Record<string, unknown>;

		expect(Object.hasOwn(compiled, "__proto__")).toBe(true);
		expect(css.props(compiled.__proto__ as never).className).toBe("color__red");
		expect(css.props(compiled.invalid as never).className).toBeUndefined();
		expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
	});

	test("design groups and raw styles do not cross the prototype boundary", () => {
		const dss = createDesignCss(examplePreset, { debug: true });
		const groups = Object.create(null) as Record<string, unknown>;
		Object.defineProperty(groups, "__proto__", {
			enumerable: true,
			value: { $raw: { color: "red" } },
		});
		const raw = Object.create(null) as Record<string, unknown>;
		Object.defineProperty(raw, "__proto__", { enumerable: true, value: "red" });

		const compiled = dss.group(groups as never) as Record<string, unknown>;
		dss({ $raw: raw } as never);

		expect(Object.hasOwn(compiled, "__proto__")).toBe(true);
		expect(dss.props(compiled.__proto__ as never).className).toBe("color__red");
		expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
	});

	test("var rules match inverted selector nesting", () => {
		const conditions = { _hover: "&:hover" } as const;
		const preset = {
			conditions,
			properties: { $all: true },
			strict: true,
			tokens: {},
		} as never;
		const css = createUnsafeCss({ conditions });
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

		const output = sheet.generate([{ lineHeight: { _hover: 1.2 } } as never]);

		expect(output).toContain("line-height:1.2");
		expect(output).not.toContain("line-height:1.2px");
	});

	test("unknown semantic token conditions fail instead of becoming root values", () => {
		const preset = {
			conditions: {},
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

	test("all empty condition aliases share the base path", () => {
		const conditions = { base: "", default: "", root: [] as string[] } as const;
		const preset = {
			conditions,
			properties: { $all: true },
			strict: true,
			tokens: {},
		} as never;
		const css = createUnsafeCss({ conditions });
		const styles = css.raw({ default: { color: "red" }, root: { padding: 4 } } as never);

		expect(() => createStylesheet(preset).generate([styles])).not.toThrow();
		const staticOutput = createStylesheet(preset).generate([styles]);
		expect(staticOutput).toContain("color:red");
		expect(staticOutput).toContain("padding:4px");
		expect(staticOutput).not.toContain("base__");
		expect(staticOutput).not.toContain("default__");
		expect(staticOutput).not.toContain("root__");

		const runtime = createRuntimeCss(preset, { sheetOptions: { autoMount: false } });
		runtime.class({ default: { color: "red" }, root: { padding: 4 } } as never);
		expect(runtime.sheet.css()).toContain("color:red");
		expect(runtime.sheet.css()).toContain("padding:4px");
	});

	test("numeric values under outer conditions normalize using the CSS property", () => {
		const conditions = { sm: "@media (min-width: 640px)" } as const;
		const preset = {
			conditions,
			properties: { $all: true },
			strict: true,
			tokens: {},
		} as never;
		const css = createUnsafeCss({ conditions });
		const styles = { sm: { lineHeight: 1.2, opacity: 0.5 } } as never;
		const staticOutput = createStylesheet(preset).generate([css.raw(styles)]);

		expect(staticOutput).toContain("line-height:1.2");
		expect(staticOutput).toContain("opacity:0.5");
		expect(staticOutput).not.toContain("1.2px");
		expect(staticOutput).not.toContain("0.5px");

		const runtime = createRuntimeCss(preset, { sheetOptions: { autoMount: false } });
		runtime.class(styles);
		expect(runtime.sheet.css()).toContain("line-height:1.2");
		expect(runtime.sheet.css()).toContain("opacity:0.5");
	});

	test("inherited style properties are not compiled as authored declarations", () => {
		const inherited = { color: "red" };
		const style = Object.assign(Object.create(inherited), { padding: 4 }) as never;
		const css = createUnsafeCss({ debug: true });

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
		const css = createUnsafeCss({ className: strategy });
		const className = css.class(style);
		const sheet = createStylesheet(preset, { className: strategy });

		expect(className).toBe("pw-color-$blue-500");
		expect(sheet.generate([style])).toContain(`.${escapeIdentifier(className)}`);

		const whitespaceClass = css.class({ color: "red blue" } as never);
		expect(whitespaceClass).not.toMatch(/\s/);
	});

	test("invalid class strategy results fall back to a safe atom", () => {
		const strategy = {
			name: "broken",
			sheetBacked: true,
			toClassName: () => undefined,
		};
		const css = createUnsafeCss({ className: strategy as never });
		const className = css.class({ color: "red" });

		expect(className).toMatch(/^[a-z0-9]+$/);
		expect(className).not.toBe("undefined");
	});

	test("implicit runtime sheets do not mix different preset token scopes", () => {
		Reflect.deleteProperty(globalThis, Symbol.for("pandwind.runtime.default-sheet"));
		const firstPreset = define.preset(
			{
				config: {} as StandardProperties,
				tokens: { colors: { $brand: "#111111" } },
			},
			{
				strict: true,
				conditions: {},
				properties: { color: { $tokens: "colors" } },
			},
		);
		const secondPreset = define.preset(
			{
				config: {} as StandardProperties,
				tokens: { colors: { $brand: "#eeeeee" } },
			},
			{
				strict: true,
				conditions: {},
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

	test("semantic parent selectors preserve ampersands inside attribute values", () => {
		const sheet = createRuntimeSheet({ autoMount: false });
		sheet.registerSemanticRules([
			{
				kind: "style",
				selector: ".item",
				conditions: ['[data-label="a&b"] &'],
				declarations: [{ property: "color", value: "red" }],
			},
		]);

		expect(sheet.css()).toContain('[data-label="a&b"] .item{color:red}');
		expect(sheet.css()).not.toContain('[data-label="a.itemb"]');
	});

	test("runtime sheet IDs are escaped before selector interpolation", () => {
		const selectors: string[] = [];
		const element = {
			tagName: "STYLE",
			textContent: "",
			setAttribute: () => {},
			remove: () => {},
		};
		const document = {
			querySelector: (selector: string) => {
				selectors.push(selector);
				return null;
			},
			createElement: () => element,
			head: { appendChild: () => {} },
		};
		const sheet = createRuntimeSheet({
			id: `host"]${String.fromCharCode(10)}`,
			document,
		});

		expect(() => sheet.mount()).not.toThrow();
		expect(selectors[0]).toContain("\\22 ");
		expect(selectors[0]).toContain("\\a ");
	});
});
