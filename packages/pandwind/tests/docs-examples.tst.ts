/** Type-checks the examples in the public API JSDoc. */
import { expect, test } from "tstyche";
import { createCss } from "../src/css/index.ts";
import { createUnsafeCss } from "../src/unsafe/css.ts";
import { createCx } from "../src/cx/index.ts";
import { createDesignCss } from "../src/design/index.ts";
import { createTw, type TwOptions } from "../src/tw/index.ts";
import {
	defineConditions,
	definePreset,
	defineProperties,
	defineTokens,
	type PandwindProperties,
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

test("CssFn JSDoc examples cover groups and runtime inputs", () => {
	const css = createUnsafeCss();
	const composed = css({ display: "flex", padding: 8 }, { padding: 12 });
	const styles = css.group({
		card: { borderRadius: 8, padding: 16 },
		gap: (value: number) => ({ gap: value }),
	});
	const banners = css.group({
		banner: {
			$input: {} as { color: string },
			color: css.input("color"),
		},
	});

	expect(composed).type.toBe<Record<string, string>>();
	expect(css.props(composed)).type.toBe<{
		className: string | undefined;
		style: Record<string, string> | undefined;
		[key: string]: unknown;
	}>();
	expect(css.props(styles.card, styles.gap(12))).type.toBe<{
		className: string | undefined;
		style: Record<string, string> | undefined;
		[key: string]: unknown;
	}>();
	expect(css.props(banners.banner({ color: "tomato" }))).type.toBe<{
		className: string | undefined;
		style: Record<string, string> | undefined;
		[key: string]: unknown;
	}>();
});

test("definePreset JSDoc example preserves a custom typed vocabulary", () => {
	const tokens = defineTokens({
		colors: { "$brand-500": "#2563eb", $surface: "#ffffff" },
		spacing: { 4: "1rem" },
	});
	const conditions = defineConditions({ _hover: "&:hover", _dark: ".dark &" });
	const semantic = tokens.defineSemanticTokens(conditions, {
		colors: { surface: { _dark: "#111827" } },
	});
	void semantic;
	const properties = defineProperties({
		backgroundColor: tokens.colors,
		color: tokens.colors,
		padding: tokens.spacing,
	});
	const cssConfig: PandwindProperties = {};
	const preset = definePreset(
		{
			config: cssConfig,
			tokens,
		},
		{ strict: true, conditions, properties },
	);
	const css = createCss(preset);

	expect(css.class({ backgroundColor: "$brand-500", padding: 4 })).type.toBe<string>();
});

test("docs example narrows the curated CSS contract with Pick", () => {
	type CardProperties = Pick<PandwindProperties, "backgroundColor" | "color" | "padding">;
	const tokens = defineTokens({
		colors: { "$brand-500": "#2563eb" },
		spacing: { 4: "1rem" },
	});
	const cardConfig: CardProperties = {};
	const preset = definePreset(
		{ config: cardConfig, tokens },
		{
			strict: true,
			conditions: {},
			properties: {
				backgroundColor: { $tokens: "colors", $strictness: "inherits" },
				color: { $tokens: "colors", $strictness: "inherits" },
				padding: { $tokens: "spacing", $strictness: "inherits" },
			},
		},
	);
	const css = createCss(preset);

	expect(
		css.class({
			backgroundColor: "$brand-500",
			color: "var(--runtime-ink)",
			padding: 4,
		}),
	).type.toBe<string>();
});

test("preset docs cover strict, inherited, and open property bindings", () => {
	const tokens = defineTokens({
		colors: { "$brand-500": "#2563eb" },
		spacing: { 4: "1rem" },
	});
	const config: Pick<PandwindProperties, "color" | "padding"> = {};

	const strictPreset = definePreset(
		{ config, tokens },
		{
			strict: true,
			conditions: {},
			properties: {
				$all: true,
				color: { $tokens: "colors" },
				padding: { $tokens: "spacing" },
			},
		},
	);
	const strictCss = createCss(strictPreset);
	expect(strictPreset.strict).type.toBe<true>();
	expect(strictPreset.properties.color).type.toBe<{ $tokens: "colors" }>();
	expect(strictPreset.tokens.colors).type.toBe<{ "$brand-500": string }>();
	expect(strictCss.class({ color: "$brand-500", padding: 4 })).type.toBe<string>();
	expect(
		strictCss.class({
			// @ts-expect-error not assignable
			color: "$not-a-token",
		}),
	).type.toBe<string>();

	const inheritedPreset = definePreset(
		{ config, tokens },
		{
			strict: true,
			conditions: {},
			properties: {
				$all: true,
				color: { $tokens: "colors", $strictness: "inherits" },
				padding: { $tokens: "spacing" },
			},
		},
	);
	const inheritedCss = createCss(inheritedPreset);
	expect(
		inheritedCss.class({
			color: "var(--brand)",
			padding: 4,
		}),
	).type.toBe<string>();

	const openPreset = definePreset(
		{ config, tokens },
		{
			strict: false,
			conditions: {},
			properties: {
				$all: true,
				color: { $tokens: "colors" },
				padding: { $tokens: "spacing" },
			},
		},
	);
	const openCss = createCss(openPreset);
	expect(openCss.class({ color: "var(--brand)", padding: 4 })).type.toBe<string>();
});

test("preset docs distinguish token paths from resolved values", () => {
	const rawTokens = defineTokens({
		colors: { $surface: "#ffffff" },
		spacing: { 4: "1rem" },
	});
	const conditions = defineConditions({ base: "", _dark: ".dark &" });
	const semanticTokens = rawTokens.defineSemanticTokens(conditions, {
		semantic: {
			"bg.surface": { base: "colors.$surface", _dark: "#111827" },
			"bg.inverse": { base: "#111827", _dark: rawTokens.colors["$surface"] },
		},
	});
	const componentTokens = semanticTokens.defineSemanticTokens(conditions, {
		component: {
			"component.card.backgroundByMode": {
				base: "semantic.bg.surface",
				_dark: "semantic.bg.inverse",
			},
		},
	});
	const tokens = {
		...rawTokens,
		semantic: semanticTokens.semantic,
		component: {
			"component.card.background": "semantic.bg.surface",
			...componentTokens.component,
		},
	};
	const cssConfig: PandwindProperties = {};
	const preset = definePreset(
		{ config: cssConfig, tokens },
		{
			strict: true,
			conditions,
			properties: {
				backgroundColor: { $tokens: "component" },
			},
		},
	);

	const css = createCss(preset);
	expect(css.class({ backgroundColor: "component.card.background" })).type.toBe<string>();
	expect(css.class({ backgroundColor: "component.card.backgroundByMode" })).type.toBe<string>();
});

test("createDesignCss JSDoc example uses the design modules", () => {
	const dss = createDesignCss(examplePreset);

	expect(
		dss.props(
			dss(
				{ $frame: { corners: "lg", fill: "$blue-500", pad: [8, 16] } },
				{
					$layout: { flow: "stackX", align: "center", gap: 8 },
					$text: { color: "$gray-50", weight: "semibold" },
					_hover: { $frame: { fill: "$blue-600" } },
				},
			),
		),
	).type.toBe<{
		className: string | undefined;
		style: Record<string, string> | undefined;
		[key: string]: unknown;
	}>();
});

test("createCx JSDoc example composes CSS atoms and conditionals", () => {
	const css = createUnsafeCss();
	const cx = createCx({ css });
	const isPrimary = true;

	expect(cx("inline-flex", isPrimary && "bg-blue-500", css({ padding: 12 }))).type.toBe<string>();
});

test("createTw JSDoc example accepts generated utility metadata", () => {
	type WindVariants = {
		bg?: string;
		sm?: { py?: string };
	};
	const generated: TwOptions = {};
	const tw = createTw<WindVariants>(generated);

	expect(tw({ bg: "sky-600", sm: { py: "12" } })).type.toBe<string>();
});
