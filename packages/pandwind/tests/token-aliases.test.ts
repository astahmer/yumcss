import type { StandardProperties } from "csstype";
import { describe, expect, test } from "vitest";
import { createCss } from "../src/css/create-css.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { createRuntimeCss } from "../src/css/runtime.ts";
import {
	definePreset,
	defineSemanticTokens,
	defineTheme,
	defineTokens,
} from "../src/types/define-preset.ts";

const rawTokens = defineTokens({
	colors: {
		"$blue-600": "#2b6cb0",
		"$blue-700": "#2c5282",
		"$gray-200": "#e5e7eb",
		"$gray-700": "#374151",
	},
});

const semanticTokens = defineSemanticTokens(
	{ base: "", _dark: ".dark &" },
	{
		semantic: {
			"bg.primary": {
				base: rawTokens.colors["$blue-600"],
				_dark: rawTokens.colors["$blue-700"],
			},
			"bg.muted": {
				base: rawTokens.colors["$gray-200"],
				_dark: rawTokens.colors["$gray-700"],
			},
		},
	},
);

const preset = definePreset(
	defineTheme({
		config: {} as StandardProperties,
		tokens: {
			colors: rawTokens.colors,
			semantic: semanticTokens.semantic,
			component: {
				"component.card.bg": "semantic.bg.primary",
				"component.card.themedBg": {
					base: "semantic.bg.primary",
					_dark: "semantic.bg.muted",
				},
			},
		},
	}),
	{
		strict: true,
		conditions: { base: "", _dark: ".dark &" },
		properties: {
			backgroundColor: { $tokens: "component" },
		},
	},
);

describe("preset token aliases", () => {
	test("component token refs keep the semantic CSS variable indirection", () => {
		const css = createCss(preset);
		const sheet = createStylesheet(preset);
		const styles = css.raw({ backgroundColor: "component.card.bg" });
		const output = sheet.generate([styles]);

		expect(output).not.toContain("semantic.bg.primary;");
		expect(output).toMatch(/--[^:]+: var\(--[^)]+\);/u);
		expect(output).toContain("#2b6cb0");
		expect(output).toContain("#2c5282");
	});

	test("conditional component token refs switch between semantic variables", () => {
		const css = createCss(preset);
		const sheet = createStylesheet(preset, { debug: true });
		const output = sheet.generate([css.raw({ backgroundColor: "component.card.themedBg" })]);

		expect(output).toMatch(/component.*var\(--semantic.*primary/u);
		expect(output).toMatch(/component.*var\(--semantic.*muted/u);
		expect(output).not.toContain("semantic.bg.primary");
		expect(output).not.toContain("semantic.bg.muted");
	});

	test("runtime sheets resolve component refs through active semantic themes", () => {
		const css = createRuntimeCss(preset, { sheetOptions: { autoMount: false } });
		css.class({ backgroundColor: "component.card.bg" });
		const output = css.sheet.css();

		expect(output).not.toContain("semantic.bg.primary");
		expect(output).toContain("background-color:var(");
		expect(output).toContain("#2b6cb0");
		expect(output).toContain("#2c5282");
	});

	test("runtime sheets resolve conditional component aliases", () => {
		const css = createRuntimeCss(preset, {
			debug: true,
			sheetOptions: { autoMount: false },
		});
		css.class({ backgroundColor: "component.card.themedBg" });
		const output = css.sheet.css();

		expect(output).toMatch(/component.*var\(--semantic.*primary/u);
		expect(output).toMatch(/component.*var\(--semantic.*muted/u);
		expect(output).not.toContain("semantic.bg.primary");
		expect(output).not.toContain("semantic.bg.muted");
	});
});
