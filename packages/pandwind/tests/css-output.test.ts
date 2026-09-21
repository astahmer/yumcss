import type { StandardLonghandProperties } from "csstype";
import { expect, test } from "vitest";
import { createUnsafeCss } from "../src/unsafe/css.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { define } from "../src/types/define-preset.export.ts";

test("define.preset defaults to strict token resolution", () => {
	const preset = define.preset(
		{ config: {}, tokens: {} },
		{ conditions: {}, properties: { $all: true } },
	);

	expect(preset.strict).toBe(true);
});

test("css gen simple prop", () => {
	const preset = define.preset(
		{
			config: {} as StandardLonghandProperties,
			tokens: {},
		},
		{
			strict: true,
			properties: {
				$all: true,
				color: {
					$strict: false,
					"blue.300": "#0000ff",
				},

				backgroundColor: true,
				border: true,
				fontSize: true,
				margin: true,
			},
			conditions: {
				base: "",
				_hover: "&:hover",
				_focus: "&:focus",
				_active: "&:active, &[data-active=true]",
				_disabled: "&:disabled, &[aria-disabled=true]",
				_dark: "@media (prefers-color-scheme: dark)",
				sm: "@media (min-width: 640px)",
				md: "@media (min-width: 768px)",
				lg: "@media (min-width: 1024px)",
				xl: "@media (min-width: 1280px)",
			},
		},
	);
	const sheet = createStylesheet(preset, { debug: true });
	const css = createUnsafeCss({ debug: true });

	const styles = css.raw({
		border: "1px solid red",

		color: "blue.300",
		caretColor: {
			base: "blue",
			_hover: "red",
		},

		base: {
			color: "blue.300",
		},
		// border: `1px solid ${css.input("colors.red.100")}`,
		backgroundColor: "blue.300",

		fontSize: {
			base: "xs",
			sm: "sm",
			_hover: {
				base: "md",
				md: "lg",
				_focus: "xl",
			},
			_dark: "2xl",
		},
		sm: {
			color: "yellow",
			backgroundColor: {
				base: "red",
				_hover: "green",
			},
		},
		"&[data-attr='test']": {
			color: "green",
			_disabled: {
				color: "purple",
				".target &": {
					color: {
						base: "cyan",
						_active: "orange",
						xl: "pink",
					},
				},
			},
		},
	});

	expect(sheet.generate([styles])).toMatchInlineSnapshot(`
		".h2y00p{border:1px solid red}
		.backgroundColor__blue\\.300{background-color:blue.300}
		.caretColor__blue{caret-color:blue}
		.color__blue\\.300{color:#0000ff}
		.fontSize__xs{font-size:xs}
		._hover__caretColor__red:hover{caret-color:red}
		._hover__fontSize__md:hover{font-size:md}
		@media (prefers-color-scheme: dark){._dark__fontSize__2xl{font-size:2xl}}
		@media (min-width: 640px){.sm__backgroundColor__red{background-color:red}}
		@media (min-width: 640px){.sm__color__yellow{color:yellow}}
		@media (min-width: 640px){.sm__fontSize__sm{font-size:sm}}
		._focus___hover__fontSize__xl:focus:hover{font-size:xl}
		@media (min-width: 640px){._hover__sm__backgroundColor__green:hover{background-color:green}}
		@media (min-width: 768px){._hover__md__fontSize__lg:hover{font-size:lg}}
		.\\&\\[data-attr\\=\\'test\\'\\]__color__green[data-attr='test']{color:green}
		.\\&\\[data-attr\\=\\'test\\'\\]___disabled__color__purple[data-attr='test']:disabled, .\\&\\[data-attr\\=\\'test\\'\\]___disabled__color__purple[data-attr='test'][aria-disabled=true]{color:purple}
		.target .bx2erf[data-attr='test']:disabled, .target .bx2erf[data-attr='test'][aria-disabled=true]{color:cyan}
		.target .\\31 jr1onx[data-attr='test']:active, .target .\\31 jr1onx[data-attr='test'][data-active=true],.target .\\31 jr1onx[data-attr='test']:disabled, .target .\\31 jr1onx[data-attr='test'][aria-disabled=true]{color:orange}
		@media (min-width: 1280px){.target .vt3lu0[data-attr='test']:disabled, .target .vt3lu0[data-attr='test'][aria-disabled=true]{color:pink}}"
	`);

	expect(createStylesheet(preset, { debug: false }).generate([styles])).toMatchInlineSnapshot(`
		".\\31 an2x2b{border:1px solid red}
		.\\31 i3nmbr{background-color:blue.300}
		.\\31 trwkxl{caret-color:blue}
		.o3b2cm{color:#0000ff}
		.\\31 ccalyg{font-size:xs}
		.todh53:hover{caret-color:red}
		.\\31 5jkarc:hover{font-size:md}
		@media (prefers-color-scheme: dark){.\\31 h7ra8l{font-size:2xl}}
		@media (min-width: 640px){.zb2oii{background-color:red}}
		@media (min-width: 640px){.l6sm6j{color:yellow}}
		@media (min-width: 640px){.\\31 cl6mth{font-size:sm}}
		.\\31 8j82hb:focus:hover{font-size:xl}
		@media (min-width: 640px){.\\31 hbrls5:hover{background-color:green}}
		@media (min-width: 768px){.\\31 06nztq:hover{font-size:lg}}
		.dfl2kn[data-attr='test']{color:green}
		.\\31 my53z8[data-attr='test']:disabled, .\\31 my53z8[data-attr='test'][aria-disabled=true]{color:purple}
		.target .\\31 ubbxbh[data-attr='test']:disabled, .target .\\31 ubbxbh[data-attr='test'][aria-disabled=true]{color:cyan}
		.target .\\31 ujpm8g[data-attr='test']:active, .target .\\31 ujpm8g[data-attr='test'][data-active=true],.target .\\31 ujpm8g[data-attr='test']:disabled, .target .\\31 ujpm8g[data-attr='test'][aria-disabled=true]{color:orange}
		@media (min-width: 1280px){.target .\\35 zgdlv[data-attr='test']:disabled, .target .\\35 zgdlv[data-attr='test'][aria-disabled=true]{color:pink}}"
	`);
});

test("keeps authored aliases literal by default", () => {
	const preset = define.preset(
		{ config: {} as StandardLonghandProperties, tokens: {} },
		{ strict: true, properties: { $all: true }, conditions: {} },
	);
	const css = createUnsafeCss({ debug: true });
	const output = createStylesheet(preset, { debug: true }).generate([
		css.raw({ bg: "red", px: 2, minH: 10 } as never),
	]);

	expect(output).toContain("bg:red");
	expect(output).toContain("px:2");
	expect(output).toContain("min-h:10");
	expect(output).not.toContain("background:red");
	expect(output).not.toContain("padding-inline:2");
	expect(output).not.toContain("min-height:10");
});

test("can opt into StyleX-like priority specificity for host precedence", () => {
	const preset = define.preset(
		{ config: {} as StandardLonghandProperties, tokens: {} },
		{ strict: true, properties: { $all: true }, conditions: { _hover: "&:hover" } },
	);
	const css = createUnsafeCss({ debug: true });
	const output = createStylesheet(preset, { debug: true, cascade: "specificity" }).generate([
		css.raw({ display: "none", _hover: { display: "block" } } as never),
	]);

	expect(output).toContain(":not(#\\#)");
	expect(output).toContain(":not(#\\#):not(#\\#)");
	expect(output).not.toContain("!important");
});

test("can opt into a native Pandwind cascade layer", () => {
	const preset = define.preset(
		{ config: {} as StandardLonghandProperties, tokens: {} },
		{ strict: true, properties: { $all: true }, conditions: {} },
	);
	const css = createUnsafeCss({ debug: true });
	const output = createStylesheet(preset, { debug: true, cascade: "layers" }).generate([
		css.raw({ display: "none" } as never),
	]);

	expect(output).toBe("@layer pandwind{.display__none{display:none}}");
});

test("can opt into a named native cascade layer", () => {
	const preset = define.preset(
		{ config: {} as StandardLonghandProperties, tokens: {} },
		{ strict: true, properties: { $all: true }, conditions: {} },
	);
	const css = createUnsafeCss({ debug: true });
	const output = createStylesheet(preset, {
		debug: true,
		cascade: { mode: "layers", layer: "app.utilities" },
	}).generate([css.raw({ display: "none" } as never)]);

	expect(output).toBe("@layer app.utilities{.display__none{display:none}}");
});

test("rejects unsafe native cascade layer names", () => {
	const preset = define.preset(
		{ config: {} as StandardLonghandProperties, tokens: {} },
		{ strict: true, properties: { $all: true }, conditions: {} },
	);
	const css = createUnsafeCss({ debug: true });
	const sheet = createStylesheet(preset, {
		debug: true,
		cascade: { mode: "layers", layer: "app;evil" },
	});

	expect(() => sheet.generate([css.raw({ display: "none" } as never)])).toThrow(
		"cascade layer must be a non-empty dotted CSS identifier path",
	);
});

test("keeps vendor-prefixed line clamp unitless", () => {
	const preset = define.preset(
		{ config: {} as StandardLonghandProperties, tokens: {} },
		{ strict: true, properties: { $all: true }, conditions: {} },
	);
	const css = createUnsafeCss({ debug: true });
	const output = createStylesheet(preset, { debug: true }).generate([
		css.raw({ WebkitLineClamp: 2 } as Parameters<typeof css.raw>[0]),
	]);

	expect(output).toContain("-webkit-line-clamp:2");
	expect(output).not.toContain("-webkit-line-clamp:2px");
});
