import { expect, test } from "vitest";
import { createCss } from "../src/css/create-css.ts";
import { createDesignCss } from "../src/design/index.ts";
import { define } from "../src/types/define-preset.export.ts";
import { tailwindTokens, tailwindPreset } from "../src/preset/tailwindcss.ts";

test("conditional CSS and design compositions match omitted branches", () => {
	const css = createCss(tailwindPreset);
	const dss = createDesignCss(tailwindPreset);
	expect(css.class(false, { display: "flex" }, null, undefined)).toBe(
		css.class({ display: "flex" }),
	);
	expect(css(false, { display: "flex" }, null, undefined)).toEqual(css({ display: "flex" }));
	expect(dss.class(false, { $layout: { flow: "stackX" } }, undefined)).toBe(
		dss.class({ $layout: { flow: "stackX" } }),
	);
});

test("spreading and extending a token catalog retains only authored enumerable groups", () => {
	const tokens = define.tokens({ ...tailwindTokens, brand: { primary: "#123456" } });
	expect(tokens.brand.primary).toBe("#123456");
	expect(tokens.colors).toEqual(tailwindTokens.colors);
	expect(Object.keys(tokens)).not.toContain("defineSemanticTokens");
	expect(Object.keys(tokens)).not.toContain("defineColorPalettes");
	expect(
		tokens.defineSemanticTokens({ base: "" }, { semantic: { primary: { base: "brand.primary" } } })
			.semantic.primary,
	).toEqual({ base: "brand.primary" });
});
