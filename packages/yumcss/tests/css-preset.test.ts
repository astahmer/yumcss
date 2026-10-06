import { expect, test } from "vitest";
import { createCss } from "../src/css/create-css.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { createUnsafeCss } from "../src/unsafe/css.ts";
import { presetConditions } from "../src/preset/conditions.ts";
import { examplePreset } from "@yumcss/example-preset";

test("preset-bound createCss keeps the same runtime class contract", () => {
	const bound = createCss(examplePreset);
	const loose = createUnsafeCss();

	expect(bound({ color: "$red-500" })).toEqual(loose({ color: "$red-500" }));
});

test("createCss rejects unbound runtime calls with the unsafe entrypoint", () => {
	expect(() => {
		// @ts-expect-error Verify the runtime guard for callers that bypass TypeScript.
		createCss();
	}).toThrow("yumcss/css: createCss requires a preset");
	expect(() => {
		// @ts-expect-error Verify invalid runtime options from untyped JavaScript callers.
		createCss({ debug: true });
	}).toThrow("yumcss/unsafe/css");
});

test("stylesheet resolution accepts dot-delimited aliases for legacy token keys", () => {
	const sheet = createStylesheet(examplePreset);
	const rules = sheet.process([{ color: "blue.500" }] as never);

	expect([...rules.values()].some((rule) => rule.css.includes("#3182ce"))).toBe(true);
});

test("built-in preset conditions use underscore names for state and mode variants", () => {
	expect(presetConditions).toHaveProperty("_hover", "&:is(:hover, [data-hover])");
	expect(presetConditions).toHaveProperty("_dark", ".dark &");
	expect(presetConditions).not.toHaveProperty("hover");
	expect(presetConditions).not.toHaveProperty("dark");
});
