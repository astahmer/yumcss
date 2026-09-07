import { expect, test } from "vitest";
import { createCss } from "../src/css/create-css.ts";
import { examplePreset } from "@pandwind/example-preset";

test("preset-bound createCss keeps the same runtime class contract", () => {
	const bound = createCss(examplePreset);
	const loose = createCss();

	expect(bound({ color: "$red-500" })).toEqual(loose({ color: "$red-500" }));
});
