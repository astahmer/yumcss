import { expect, test } from "vitest";
import { define } from "../src/preset/index.ts";
import { createCss } from "../src/css/create-css.ts";
import { createTwAdapter } from "../src/tw/adapter.ts";
import { tailwindPreset } from "../src/preset/tailwindcss.ts";
import { compileClasses, rulesForClass } from "./helpers/tailwind-proof.ts";

test("Tailwind adapter uses concrete preset values without YumCSS variables", async () => {
	const value = tailwindPreset.tokens.colors["$blue-500"];
	const adapter = createTwAdapter({
		preset: tailwindPreset,
		variants: {},
		bridge: { "background-color": { [value]: "bg-blue-500" } },
	});
	const css = createCss(tailwindPreset, { className: adapter });
	const className = css.class({ backgroundColor: "$blue-500" });
	expect(className).toBe("bg-blue-500");
	const { root } = await compileClasses('@import "tailwindcss";', [className]);
	expect(rulesForClass(root, className)).not.toHaveLength(0);
	expect(root.toString()).not.toMatch(/var\(--[a-z0-9]{6,}\)/);
});

test("Tailwind adapter follows aliases and rejects theme-dependent token values", () => {
	const preset = define.preset(
		{
			config: {},
			tokens: {
				colors: { blue: "#123456" },
				semantic: { brand: "colors.blue", surface: { base: "colors.blue", _dark: "black" } },
			},
		},
		{ conditions: { _dark: ".dark &" }, properties: { backgroundColor: { $tokens: "semantic" } } },
	);
	const adapter = createTwAdapter({
		preset,
		variants: {},
		bridge: { "background-color": { "#123456": "bg-brand" } },
	});
	const css = createCss(preset, { className: adapter });
	expect(css.class({ backgroundColor: "brand" })).toBe("bg-brand");
	expect(css.class({ $raw: { backgroundColor: "#abcdef" } })).toBe("[background-color:#abcdef]");
	expect(() => css.class({ backgroundColor: "surface" })).toThrow("requires a theme context");
});
