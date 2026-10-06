import { expect, test } from "tstyche";
import { typeValue } from "./type-fixtures.ts";
import { createCss, type AtomicStyleProps, type ClassNameStrategy } from "yumcss/css";
import { createUnsafeCss } from "yumcss/unsafe/css";
import { define, type AnyCssConfig, type YumCSSProperties } from "yumcss/preset";
import type { StandardProperties as CsstypeStandardProperties } from "csstype";
import { examplePreset } from "@yumcss/example-preset";

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
			padingBlock: "8px",
		}),
	).type.toBe<Compiled>();

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

	expect(
		css({
			// @ts-expect-error not assignable
			color: "acent",
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

test("strict token bindings retain property-aware intrinsic CSS values", () => {
	const preset = define.preset(
		{
			config: {} as YumCSSProperties,
			tokens: {
				colors: { brand: "#2563eb" },
				spacing: { 2: "0.5rem" },
				fontWeights: { semibold: "600" },
				display: { grid: "grid" },
			},
		},
		{
			strict: true,
			conditions: {},
			properties: {
				backgroundColor: { $tokens: "colors" },
				display: { $tokens: "display" },
				fontWeight: { $tokens: "fontWeights" },
				marginLeft: { $tokens: "spacing" },
			},
		},
	);
	const strictCss = createCss(preset);

	expect(
		strictCss({
			backgroundColor: "transparent",
			display: "flex",
			fontWeight: "bold",
			marginLeft: "auto",
		}),
	).type.toBe<Compiled>();
	expect(strictCss({ backgroundColor: "brand" })).type.toBe<Compiled>();
	expect(strictCss({ fontWeight: "semibold" })).type.toBe<Compiled>();

	expect(
		strictCss({
			// @ts-expect-error not assignable
			backgroundColor: "auto",
		}),
	).type.toBe<Compiled>();
	expect(
		strictCss({
			// @ts-expect-error not assignable
			backgroundColor: "acent",
		}),
	).type.toBe<Compiled>();
	expect(
		strictCss({
			// @ts-expect-error not assignable
			marginLeft: "flex",
		}),
	).type.toBe<Compiled>();
});

test("curated CSS values stay literal unions for editor suggestions", () => {
	type NonNullish<Value> = Exclude<Value, null | undefined>;
	type WidenedPropertyNames = {
		[PropertyName in keyof YumCSSProperties]-?: string extends NonNullish<
			YumCSSProperties[PropertyName]
		>
			? PropertyName
			: never;
	}[keyof YumCSSProperties];

	type ExampleStyle = Parameters<typeof css.class>[0];
	type ExampleDisplay = NonNullish<ExampleStyle["display"]>;

	const strictPreset = define.preset(
		{
			config: {} as YumCSSProperties,
			tokens: { display: { grid: "grid" } },
		},
		{
			strict: true,
			conditions: { _hover: "&:hover" },
			properties: { display: { $tokens: "display" } },
		},
	);
	const strictCss = createCss(strictPreset);
	type StrictStyle = Parameters<typeof strictCss.class>[0];
	type StrictDisplay = NonNullish<StrictStyle["display"]>;
	expect(strictCss.class({ display: "flex", _hover: { display: "grid" } })).type.toBe<string>();

	const openStrictPreset = define.preset(
		{
			config: {} as YumCSSProperties,
			tokens: { display: { grid: "grid" } },
		},
		{
			strict: true,
			conditions: {},
			properties: { display: { $tokens: "display", $strict: false } },
		},
	);
	const openStrictCss = createCss(openStrictPreset);
	type OpenStrictStyle = Parameters<typeof openStrictCss.class>[0];
	type OpenStrictDisplay = NonNullish<OpenStrictStyle["display"]>;
	expect(openStrictCss.class({ display: "block" })).type.toBe<string>();

	expect(typeValue<WidenedPropertyNames>()).type.toBe<never>();
	expect(typeValue<string extends ExampleDisplay ? true : false>()).type.toBe<false>();
	expect(typeValue<string extends StrictDisplay ? true : false>()).type.toBe<false>();
	expect(typeValue<string extends OpenStrictDisplay ? true : false>()).type.toBe<false>();
	expect(typeValue<Extract<ExampleDisplay, "flex">>()).type.toBe<"flex">();
	expect(typeValue<Extract<StrictDisplay, "flex">>()).type.toBe<"flex">();
	expect(typeValue<Extract<OpenStrictDisplay, "flex">>()).type.toBe<"flex">();
});

test("YumCSSProperties exposes a curated CSS contract with an explicit csstype escape hatch", () => {
	const common: YumCSSProperties = {
		display: "flex",
		padding: 16,
		alignItems: "center",
		backgroundColor: "transparent",
		fontWeight: "bold",
		marginLeft: "auto",
		overflow: "hidden",
		position: "relative",
	};
	const modernDisplay: YumCSSProperties = { display: "inline-flex" };
	const invalid: YumCSSProperties = {
		// @ts-expect-error not assignable
		display: "xxx",
	};
	const invalidLegacyDisplay: YumCSSProperties = {
		// @ts-expect-error not assignable
		display: "-webkit-box",
	};
	const invalidFiniteKeyword: YumCSSProperties = {
		// @ts-expect-error not assignable
		pointerEvents: "xxx",
	};
	const unsupported: YumCSSProperties = {
		// @ts-expect-error does not exist in type
		animationName: "fade-in",
	};
	const full: CsstypeStandardProperties = { animationName: "fade-in" };

	expect(common).type.toBe<YumCSSProperties>();
	expect(modernDisplay).type.toBe<YumCSSProperties>();
	expect(invalid).type.toBe<YumCSSProperties>();
	expect(invalidLegacyDisplay).type.toBe<YumCSSProperties>();
	expect(invalidFiniteKeyword).type.toBe<YumCSSProperties>();
	expect(unsupported).type.toBe<YumCSSProperties>();
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
	expect(generated.class({ padingBlock: "8px" })).type.toBe<string>();
	generated.class({
		// @ts-expect-error not assignable
		colorPalette: "brand",
	});

	const permissivePreset = define.preset(
		{ config: {} as AnyCssConfig, tokens: {} },
		{ strict: false, conditions: {}, properties: { $all: true } },
	);
	const permissive = createCss(permissivePreset);
	expect(permissive.class({ padingBlock: "8px", color: "acent" })).type.toBe<string>();
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
