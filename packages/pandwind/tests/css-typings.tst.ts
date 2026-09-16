import { expect, test } from "tstyche";
import { createCss, type AtomicStyleProps, type ClassNameStrategy } from "../src/css/index.ts";
import { createUnsafeCss } from "../src/unsafe/css.ts";
import { define, type AnyCssConfig, type PandwindProperties } from "../src/preset/index.ts";
import type { StandardProperties as CsstypeStandardProperties } from "csstype";
import { examplePreset } from "@pandwind/example-preset";

const css = createCss(examplePreset);
type Compiled = Record<string, string>;

test("css exposes the class-name strategy contract as a type", () => {
	const strategy: ClassNameStrategy = {
		name: "custom",
		toClassName: (key, value) => `custom-${key}-${value}`,
	};

	expect(strategy).type.toBe<ClassNameStrategy>();
});

test("createCss binds ordinary properties and preset token values", () => {
	expect(
		css({
			color: "$red-500",
			backgroundColor: "$blue-500",
			_hover: { color: "$red-700" },
		}),
	).type.toBe<Compiled>();
});

test("createCss accepts explicit container-query conditions", () => {
	expect(
		css({
			"@container (min-width: 28rem)": {
				backgroundColor: "$blue-500",
			},
		}),
	).type.toBe<Compiled>();
});

test("createCss rejects properties and token values outside the preset", () => {
	expect(
		css({
			// @ts-expect-error does not exist in type
			boxShadow: "lg",
		}),
	).type.toBe<Compiled>();

	expect(
		css({
			// @ts-expect-error not assignable
			backgroundColor: "not-a-color",
		}),
	).type.toBe<Compiled>();
});

test("createCss rejects invalid finite CSS keywords", () => {
	expect(
		css({
			// @ts-expect-error not assignable
			display: "xxx",
		}),
	).type.toBe<Compiled>();
});

test("PandwindProperties exposes a curated CSS contract with an explicit csstype escape hatch", () => {
	const common: PandwindProperties = {
		display: "flex",
		padding: "1rem",
		alignItems: "center",
		position: "relative",
		overflow: "hidden auto",
	};
	const modernDisplay: PandwindProperties = { display: "inline-flex" };
	const invalid: PandwindProperties = {
		// @ts-expect-error not assignable
		display: "xxx",
	};
	const invalidLegacyDisplay: PandwindProperties = {
		// @ts-expect-error not assignable
		display: "-webkit-box",
	};
	const invalidFiniteKeyword: PandwindProperties = {
		// @ts-expect-error not assignable
		pointerEvents: "xxx",
	};
	const unsupported: PandwindProperties = {
		// @ts-expect-error does not exist in type
		animationName: "fade-in",
	};
	const full: CsstypeStandardProperties = { animationName: "fade-in" };

	expect(common).type.toBe<PandwindProperties>();
	expect(modernDisplay).type.toBe<PandwindProperties>();
	expect(invalid).type.toBe<PandwindProperties>();
	expect(invalidLegacyDisplay).type.toBe<PandwindProperties>();
	expect(invalidFiniteKeyword).type.toBe<PandwindProperties>();
	expect(unsupported).type.toBe<PandwindProperties>();
	expect(full).type.toBe<CsstypeStandardProperties>();
});

test("createCss requires a preset while the unsafe lane stays explicit", () => {
	// @ts-expect-error Expected 1-2 arguments, but got 0.
	createCss();
	// @ts-expect-error Object literal may only specify known properties
	createCss({ debug: true });

	const loose = createUnsafeCss();
	expect(loose({ arbitraryProperty: "value" })).type.toBe<Compiled>();
});

test("AtomicStyleProps preserves the selected CssFn style vocabulary", () => {
	const loose = createUnsafeCss();
	const typed = createCss(examplePreset);

	const openStyles: AtomicStyleProps<typeof loose> = { arbitraryProperty: "value" };
	const typedStyles: Pick<
		AtomicStyleProps<typeof typed>,
		"backgroundColor" | "borderRadius" | "padding"
	> = {
		backgroundColor: "$blue-500",
		borderRadius: "lg",
		padding: 4,
	};

	expect(openStyles).type.toBe<AtomicStyleProps<typeof loose>>();
	expect(typedStyles).type.toBe<
		Pick<AtomicStyleProps<typeof typed>, "backgroundColor" | "borderRadius" | "padding">
	>();
});

test("an open preset config keeps arbitrary CSS properties typed", () => {
	const preset = define.preset(
		{ config: {} as AnyCssConfig, tokens: {} },
		{ strict: true, conditions: {}, properties: { $all: true } },
	);
	const generated = createCss(preset);
	expect(generated.class({ backgroundColor: "var(--brand)", color: "white" })).type.toBe<string>();
	generated.class({
		// @ts-expect-error not assignable
		colorPalette: "brand",
	});
});

test("semantic token references are checked against the supplied catalog", () => {
	const tokens = define.tokens({
		colors: {
			brand: "#2563eb",
			muted: "#64748b",
		},
	});
	const conditions = { base: "", _dark: ".dark &" };

	const themedTokens = tokens.defineSemanticTokens(conditions, {
		semantic: {
			button: { base: "colors.brand", _dark: "colors.muted" },
		},
	});

	expect(themedTokens).type.toHaveProperty("semantic");

	tokens.defineSemanticTokens(conditions, {
		semantic: {
			button: {
				// @ts-expect-error not assignable
				base: "colors.unknown",
				// @ts-expect-error not assignable
				_missing: "colors.brand",
			},
		},
	});

	const componentTokens = themedTokens.defineSemanticTokens(conditions, {
		component: {
			button: {
				base: "colors.brand",
				_dark: "colors.muted",
			},
		},
	});

	expect(componentTokens).type.toHaveProperty("colors");
	expect(componentTokens).type.toHaveProperty("component");
});
