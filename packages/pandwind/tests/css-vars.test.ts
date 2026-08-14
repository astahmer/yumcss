import type { StandardLonghandProperties } from "csstype";
import { expect, test } from "vitest";
import { createCss } from "../src/css/create-css.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import {
	defineConditions,
	definePreset,
	defineSemanticTokens,
	defineTokens,
} from "../src/types/define-preset.ts";

test("css tokens simple vars", () => {
	const tokens = defineTokens({
		colors: {
			"$red-500": "#E53E3E",
			"$green-500": "#60A3BC",
		},
	});

	const preset = definePreset(
		{
			config: {} as StandardLonghandProperties,
			tokens: {
				colors: tokens.colors,
			},
		},
		{
			strict: true,
			properties: {
				color: {
					$strictness: "inherits",
					$tokens: "colors",
				},
			},
			conditions: {
				base: "",
				_hover: "&:hover",
			},
		},
	);
	const sheet = createStylesheet(preset, { debug: true });
	const css = createCss<typeof preset>({ debug: true });

	const styles = css.raw({
		color: "$green-500",
		_hover: {
			color: "$red-500",
		},
	});

	expect(sheet.generate([styles])).toMatchInlineSnapshot(`
		":root {--colors__\\$green-500: #60A3BC;}
		:root {--colors__\\$red-500: #E53E3E;}
		.color__$green-500{color:var(--colors__\\$green-500)}
		._hover__color__$red-500:hover{color:var(--colors__\\$red-500)}"
	`);

	expect(
		createStylesheet(preset, { debug: false }).generate([styles]),
	).toMatchInlineSnapshot(`
		":root {--18c7uto: #E53E3E;}
		:root {--1l8nf6e: #60A3BC;}
		.1eewoyj{color:var(--1l8nf6e)}
		.dlzhtx:hover{color:var(--18c7uto)}"
	`);
});

test("css tokens semantic vars", () => {
	const tokens = defineTokens({
		colors: {
			"$red-500": "#E53E3E",
			"$green-500": "#60A3BC",
		},
		spacing: {
			20: "20px",
		},
	});

	const semanticTokens = defineTokens({
		colors: {
			success: tokens.colors["$green-500"],
			error: tokens.colors["$red-500"],
		},
		spacing: {
			"button.padding": tokens.spacing["20"],
		},
	});

	const preset = definePreset(
		{
			config: {} as StandardLonghandProperties,
			tokens: {
				colors: {
					...tokens.colors,
					...semanticTokens.colors,
				},
				spacing: {
					...tokens.spacing,
					...semanticTokens.spacing,
				},
			},
		},
		{
			strict: true,
			properties: {
				color: {
					$strictness: "inherits",
					$tokens: "colors",
				},
				marginTop: { $tokens: "spacing" },
			},
			conditions: {
				base: "",
				_hover: "&:hover",
			},
		},
	);
	const sheet = createStylesheet(preset, { debug: true });
	const css = createCss<typeof preset>({ debug: true });

	const styles = css.raw({
		color: "error",
		_hover: {
			color: "success",
		},
		marginTop: "button.padding",
	});

	expect(sheet.generate([styles])).toMatchInlineSnapshot(`
		":root {--colors__\\$green-500: #60A3BC;}
		:root {--colors__\\$red-500: #E53E3E;}
		:root {--colors__error: #E53E3E;}
		:root {--colors__success: #60A3BC;}
		:root {--spacing__20: 20px;}
		:root {--spacing__button\\.padding: 20px;}
		.color__error{color:var(--colors__error)}
		.marginTop__button.padding{margin-top:var(--spacing__button\\.padding)}
		._hover__color__success:hover{color:var(--colors__success)}"
	`);

	expect(
		createStylesheet(preset, { debug: false }).generate([styles]),
	).toMatchInlineSnapshot(`
		":root {--11sszm1: #E53E3E;}
		:root {--12u3ug6: #60A3BC;}
		:root {--18c7uto: #E53E3E;}
		:root {--1l8nf6e: #60A3BC;}
		:root {--1p1d4j8: 20px;}
		:root {--eztoah: 20px;}
		.1lmb8rn{color:var(--11sszm1)}
		.1pemsfc{margin-top:var(--eztoah)}
		.uuyh3c:hover{color:var(--12u3ug6)}"
	`);
});

test("css tokens semantic conditional vars", () => {
	const tokens = defineTokens({
		colors: {
			"$blue-500": "#ebf8ff",
			"$blue-700": "#2b6cb0",
			//
			"$red-500": "#E53E3E",
			"$red-700": "#9B2C2C",
			//
			"$green-500": "#60A3BC",
			"$green-700": "#3A6271",
		},
	});

	const conditions = defineConditions({
		base: "",
		// Color modes
		_dark: ".dark &",
		_light: ".light &",
	});

	const semanticTokens = defineSemanticTokens(conditions, {
		colors: {
			success: {
				base: tokens.colors["$blue-500"],
				_light: tokens.colors["$green-500"],
				_dark: tokens.colors["$green-700"],
			},
			error: {
				base: tokens.colors["$blue-700"],
				_light: tokens.colors["$green-500"],
				_dark: tokens.colors["$red-700"],
			},
		},
	});

	const preset = definePreset(
		{
			config: {} as StandardLonghandProperties,
			tokens: {
				colors: {
					...tokens.colors,
					...semanticTokens.colors,
				},
			},
		},
		{
			strict: true,
			properties: {
				color: {
					$tokens: "colors",
				},
			},
			conditions: conditions,
		},
	);
	const sheet = createStylesheet(preset, { debug: true });
	const css = createCss<typeof preset>({ debug: true });

	const styles = css.raw({
		color: "error",
	});

	expect(sheet.generate([styles])).toMatchInlineSnapshot(`
    ":root {--colors__error: #2b6cb0;}
    :root {--colors__success: #ebf8ff;}
    :root {--colors__\\$blue-500: #ebf8ff;}
    :root {--colors__\\$blue-700: #2b6cb0;}
    :root {--colors__\\$green-500: #60A3BC;}
    :root {--colors__\\$green-700: #3A6271;}
    :root {--colors__\\$red-500: #E53E3E;}
    :root {--colors__\\$red-700: #9B2C2C;}
    .dark {--colors__error: #9B2C2C;}
    .dark {--colors__success: #3A6271;}
    .light {--colors__error: #60A3BC;}
    .light {--colors__success: #60A3BC;}
    .color__error{color:var(--colors__error)}"
  `);

	expect(
		createStylesheet(preset, { debug: false }).generate([styles]),
	).toMatchInlineSnapshot(`
      ":root {--11sszm1: #2b6cb0;}
      :root {--12u3ug6: #ebf8ff;}
      :root {--15vw4wf: #ebf8ff;}
      :root {--18c7uto: #E53E3E;}
      :root {--1l8nf6e: #60A3BC;}
      :root {--1njbej7: #2b6cb0;}
      :root {--fe67qj: #3A6271;}
      :root {--uso9gc: #9B2C2C;}
      .dark {--11sszm1: #9B2C2C;}
      .dark {--12u3ug6: #3A6271;}
      .light {--11sszm1: #60A3BC;}
      .light {--12u3ug6: #60A3BC;}
      .1lmb8rn{color:var(--11sszm1)}"
    `);
});
