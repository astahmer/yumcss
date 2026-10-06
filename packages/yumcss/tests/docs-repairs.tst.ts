import { expect, test } from "tstyche";
import { createCss, type AtomicStyleProps } from "yumcss/css";
import { createDesignCss } from "yumcss/design";
import { define, type YumCSSProperties } from "yumcss/preset";
import { tailwindTokens, tailwindPreset } from "yumcss/preset/tailwindcss";
import { typeValue } from "./type-fixtures.ts";

const css = createCss(tailwindPreset);

test("CSS composition accepts conditional objects without widening its vocabulary", () => {
	const enabled = typeValue<boolean>();
	expect(
		css.class({ display: "flex" }, enabled && { padding: 4 }, false, null, undefined),
	).type.toBe<string>();
	expect(css({ display: "flex" }, enabled && { padding: 4 }, false, null, undefined)).type.toBe<
		Record<string, string>
	>();
	expect(css.class).type.not.toBeCallableWith({ padding: "missing-token" });
	expect<AtomicStyleProps<typeof css>>().type.not.toBeAssignableFrom<false>();
	const dss = createDesignCss(tailwindPreset);
	expect(dss.class(false, { $frame: { pad: "1rem" } }, undefined)).type.toBe<string>();
});

test("raw token catalogs can be spread and extended without stripping composers", () => {
	const tokens = define.tokens({ ...tailwindTokens, brand: { primary: "#123456" } });
	expect(tokens.brand.primary).type.toBe<string>();
	expect(tokens.colors["$blue-500"]).type.toBe<"oklch(62.3% 0.214 259.815)">();
	const semantic = tokens.defineSemanticTokens(
		{ base: "" },
		{
			semantic: { primary: { base: "brand.primary" } },
		},
	);
	expect(semantic.semantic.primary.base).type.toBe<"brand.primary">();
	expect(define.tokens).type.not.toBeCallableWith({ colors: { bad: 12 } });
	expect(define.tokens).type.not.toBeCallableWith({ colors: { bad: { base: "red" } } });
});

test("open bindings use configured values while unrestricted CSS stays explicit", () => {
	const config: YumCSSProperties = {};
	const preset = define.preset(
		{ config, tokens: { colors: { brand: "#123456" } } },
		{
			conditions: {},
			properties: { color: { $tokens: "colors", $strict: false } },
		},
	);
	const css = createCss(preset);
	expect(css.class({ color: "brand" })).type.toBe<string>();
	expect(css.class({ color: "currentColor" })).type.toBe<string>();
	expect(css.class).type.not.toBeCallableWith({ color: "#abcdef" });
	expect(css.class({ $raw: { color: "#abcdef" } })).type.toBe<string>();
});
