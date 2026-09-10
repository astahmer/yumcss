/**
 * The public examples in the API JSDoc are intentionally mirrored here.
 * tstyche keeps the examples honest without making documentation comments
 * part of the runtime test bundle.
 */
import { expect, test } from "tstyche";
import type { StandardProperties } from "csstype";
import { createCss } from "../src/css/index.ts";
import { createCx } from "../src/cx/index.ts";
import { createDesignCss } from "../src/design/index.ts";
import {
	defineConditions,
	definePreset,
	defineProperties,
	defineSemanticTokens,
	defineTheme,
	defineTokens,
} from "../src/preset/index.ts";
import { examplePreset } from "@pandwind/example-preset";

test("createCss JSDoc examples use the preset for token references", () => {
	const css = createCss(examplePreset);

	expect(
		css.class({
			backgroundColor: "$blue-500",
			padding: 16,
			_hover: { backgroundColor: "$blue-600" },
		}),
	).type.toBe<string>();
});

test("definePreset JSDoc example preserves a custom typed vocabulary", () => {
	const tokens = defineTokens({
		colors: { "$brand-500": "#2563eb", $surface: "#ffffff" },
		spacing: { 4: "1rem" },
	});
	const conditions = defineConditions({ _hover: "&:hover", _dark: ".dark &" });
	const semantic = defineSemanticTokens(conditions, {
		colors: { surface: { _dark: "#111827" } },
	});
	void semantic;
	const properties = defineProperties({
		backgroundColor: tokens.colors,
		color: tokens.colors,
		padding: tokens.spacing,
	});
	const preset = definePreset(
		defineTheme({
			config: {} as StandardProperties,
			tokens,
		}),
		{ strict: true, conditions, properties },
	);
	const css = createCss(preset);

	expect(css.class({ backgroundColor: "$brand-500", padding: 4 })).type.toBe<string>();
});

test("createDesignCss JSDoc example uses the design modules", () => {
	const dcss = createDesignCss(examplePreset);

	expect(
		dcss.class({
			$frame: { corners: "lg", fill: "$blue-500", pad: [8, 16] },
			$layout: { flow: "stackX", align: "center", gap: 8 },
			$text: { color: "$gray-50", weight: "semibold" },
			_hover: { $frame: { fill: "$blue-600" } },
		}),
	).type.toBe<string>();
});

test("createCx JSDoc example composes CSS atoms and conditionals", () => {
	const css = createCss();
	const cx = createCx({ css });
	const isPrimary = true;

	expect(
		cx("inline-flex", isPrimary && "bg-blue-500", css.class({ padding: 12 })),
	).type.toBe<string>();
});
