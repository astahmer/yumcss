import { expect, test } from "vitest";
import { createCss } from "../src/css/create-css.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { examplePreset } from "@pandwind/example-preset";

test("preset-bound createCss keeps the same runtime class contract", () => {
	const bound = createCss(examplePreset);
	const loose = createCss();

	expect(bound({ color: "$red-500" })).toEqual(loose({ color: "$red-500" }));
});

test("stylesheet resolution accepts dot-delimited aliases for legacy token keys", () => {
	const sheet = createStylesheet(examplePreset);
	const rules = sheet.process([{ color: "blue.500" }] as never);

	expect([...rules.values()].some((rule) => rule.css.includes("#3182ce"))).toBe(true);
});
