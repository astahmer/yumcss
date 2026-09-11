import type { StandardLonghandProperties } from "csstype";
import { expect, test } from "vitest";
import { createCss } from "../src/css/create-css.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { definePreset } from "../src/types/define-preset.ts";

test("css gen simple prop", () => {
	const preset = definePreset(
		{
			config: {} as StandardLonghandProperties,
			tokens: {},
		},
		{
			strict: true,
			properties: {
				$all: true,
				color: {
					$strictness: "inherits",
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
	const css = createCss<typeof preset>({ debug: true });

	const styles = css.raw({
		// @ts-expect-error
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
		@media (min-width: 640px){.backgroundColor__sm__red{background-color:red}}
		@media (min-width: 640px){.color__sm__yellow{color:yellow}}
		@media (min-width: 640px){.fontSize__sm__sm{font-size:sm}}
		._focus___hover__fontSize__xl:focus:hover{font-size:xl}
		@media (min-width: 640px){._hover__backgroundColor__sm__green:hover{background-color:green}}
		@media (min-width: 768px){._hover__fontSize__md__lg:hover{font-size:lg}}
		.\\&\\[data-attr\\=\\'test\\'\\]__color__green[data-attr='test']{color:green}
		.\\&\\[data-attr\\=\\'test\\'\\]___disabled__color__purple[data-attr='test']:disabled, .\\&\\[data-attr\\=\\'test\\'\\]___disabled__color__purple[data-attr='test'][aria-disabled=true]{color:purple}
		.target .bx2erf[data-attr='test']:disabled, .target .bx2erf[data-attr='test'][aria-disabled=true]{color:cyan}
		.target .\\31 jr1onx[data-attr='test']:active, .target .\\31 jr1onx[data-attr='test'][data-active=true],.target .\\31 jr1onx[data-attr='test']:disabled, .target .\\31 jr1onx[data-attr='test'][aria-disabled=true]{color:orange}
		@media (min-width: 1280px){.target .mzg6ce[data-attr='test']:disabled, .target .mzg6ce[data-attr='test'][aria-disabled=true]{color:pink}}"
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
		@media (min-width: 640px){.\\31 u09me2{background-color:red}}
		@media (min-width: 640px){.\\39 y7qdf{color:yellow}}
		@media (min-width: 640px){.d7l77k{font-size:sm}}
		.\\31 8j82hb:focus:hover{font-size:xl}
		@media (min-width: 640px){.lk2n4:hover{background-color:green}}
		@media (min-width: 768px){.\\31 dw8wnh:hover{font-size:lg}}
		.dfl2kn[data-attr='test']{color:green}
		.\\31 my53z8[data-attr='test']:disabled, .\\31 my53z8[data-attr='test'][aria-disabled=true]{color:purple}
		.target .\\31 ubbxbh[data-attr='test']:disabled, .target .\\31 ubbxbh[data-attr='test'][aria-disabled=true]{color:cyan}
		.target .\\31 ujpm8g[data-attr='test']:active, .target .\\31 ujpm8g[data-attr='test'][data-active=true],.target .\\31 ujpm8g[data-attr='test']:disabled, .target .\\31 ujpm8g[data-attr='test'][aria-disabled=true]{color:orange}
		@media (min-width: 1280px){.target .y9ze62[data-attr='test']:disabled, .target .y9ze62[data-attr='test'][aria-disabled=true]{color:pink}}"
	`);
});

test("keeps vendor-prefixed line clamp unitless", () => {
	const preset = definePreset(
		{ config: {} as StandardLonghandProperties, tokens: {} },
		{ strict: true, properties: { $all: true }, conditions: { base: "" } },
	);
	const css = createCss<typeof preset>({ debug: true });
	const output = createStylesheet(preset, { debug: true }).generate([
		css.raw({ WebkitLineClamp: 2 } as Parameters<typeof css.raw>[0]),
	]);

	expect(output).toContain("-webkit-line-clamp:2");
	expect(output).not.toContain("-webkit-line-clamp:2px");
});
