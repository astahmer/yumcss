import { define } from "../types/define-preset.export.ts";
import type { TokenGroupKey } from "../types/typings.ts";
import { presetConditions } from "./conditions.ts";
import { tailwindcssTheme } from "./generated/tailwindcss-theme.ts";
import { presetProperties, type YumCSSProperties } from "./properties.ts";

const tailwindCssConfig: YumCSSProperties = {};

const {
	colors,
	fontFamilies,
	fontSizes,
	fontWeights,
	lineHeights,
	letterSpacings,
	radii,
	shadows,
	textShadows,
	containers,
	breakpoints,
	transitions,
	zIndices,
} = tailwindcssTheme;

/**
 * Tailwind v4 theme namespaces as a YumCSS token catalog.
 *
 * The groups are the ones a Tailwind utility reads from `theme.css`, minus the
 * breakpoint namespace, which only feeds the condition map below.
 *
 * @category tokens
 * @since 0.1.0
 */
export const tailwindTokens = define.tokens({
	colors,
	fontFamilies,
	fontSizes,
	fontWeights,
	lineHeights,
	letterSpacings,
	radii,
	shadows,
	textShadows,
	containers,
	transitions,
	zIndices,
});

/** The inferred type of {@link tailwindTokens}. */
export type TailwindTokens = typeof tailwindTokens;

type TailwindTokenGroup = TokenGroupKey<TailwindTokens>;

// Bound namespaces are token-only by default. Use `$raw` at a call site for a
// one-off authored value, or `$strict: false` only for an intentionally open
// application-owned property map.
const tokenBinding = <const TGroup extends TailwindTokenGroup>(group: TGroup) => ({
	$tokens: group,
});
const strictTokenBinding = <const TGroup extends TailwindTokenGroup>(group: TGroup) =>
	({ $tokens: group, $strict: true }) as const;

/**
 * Property vocabulary of {@link tailwindPreset}.
 *
 * It is {@link presetProperties} with every scale Tailwind v4 owns rebound to
 * the matching namespace from {@link tailwindcssTheme}. Spacing, sizing, and
 * border widths keep the stock YumCSS groups: Tailwind v4 dropped its
 * explicit space scale for `--spacing: 0.25rem` multiplied by the utility
 * number, and the stock 4px grid resolves to the same value on every step that
 * scale enumerates.
 *
 * @category presets
 * @since 0.1.0
 */
export const tailwindProperties = define.properties({
	...presetProperties,
	boxShadow: tokenBinding("shadows"),
	textShadow: tokenBinding("textShadows"),
	fontFamily: tokenBinding("fontFamilies"),
	fontSize: tokenBinding("fontSizes"),
	fontWeight: tokenBinding("fontWeights"),
	lineHeight: tokenBinding("lineHeights"),
	letterSpacing: tokenBinding("letterSpacings"),
	borderRadius: tokenBinding("radii"),
	borderTopLeftRadius: tokenBinding("radii"),
	borderTopRightRadius: tokenBinding("radii"),
	borderBottomLeftRadius: tokenBinding("radii"),
	borderBottomRightRadius: tokenBinding("radii"),
	borderStartStartRadius: tokenBinding("radii"),
	borderStartEndRadius: tokenBinding("radii"),
	borderEndStartRadius: tokenBinding("radii"),
	borderEndEndRadius: tokenBinding("radii"),
	minWidth: tokenBinding("containers"),
	maxWidth: tokenBinding("containers"),
	zIndex: tokenBinding("zIndices"),
	transition: tokenBinding("transitions"),
	color: strictTokenBinding("colors"),
	background: strictTokenBinding("colors"),
	backgroundColor: strictTokenBinding("colors"),
	borderColor: strictTokenBinding("colors"),
	borderTopColor: strictTokenBinding("colors"),
	borderRightColor: strictTokenBinding("colors"),
	borderBottomColor: strictTokenBinding("colors"),
	borderLeftColor: strictTokenBinding("colors"),
	borderInlineEndColor: strictTokenBinding("colors"),
	outlineColor: strictTokenBinding("colors"),
	textDecorationColor: strictTokenBinding("colors"),
	textEmphasisColor: strictTokenBinding("colors"),
	fill: strictTokenBinding("colors"),
	stroke: strictTokenBinding("colors"),
});

/** The inferred property-vocabulary type of {@link tailwindProperties}. */
export type TailwindProperties = typeof tailwindProperties;

// Written key by key: the values stay generated, while the explicit keys keep
// the breakpoint names typed and spreadable. The parity test fails when
// upstream ships a breakpoint this map does not name yet.
const breakpointConditions = {
	sm: `@media (min-width: ${breakpoints.sm})`,
	md: `@media (min-width: ${breakpoints.md})`,
	lg: `@media (min-width: ${breakpoints.lg})`,
	xl: `@media (min-width: ${breakpoints.xl})`,
	"2xl": `@media (min-width: ${breakpoints["2xl"]})`,
};

/**
 * Condition map of {@link tailwindPreset}.
 *
 * The stock YumCSS conditions plus Tailwind's five breakpoints as min-width
 * media queries. The `px` widths keep the stylesheet ordering policy able to
 * place narrower rules before wider ones regardless of scan order. Tailwind's
 * `max-*` and range variants are not part of the map; add them as project
 * conditions.
 *
 * @category presets
 * @since 0.1.0
 */
export const tailwindConditions = define.conditions({
	...presetConditions,
	...breakpointConditions,
});

/** The inferred condition-key type of {@link tailwindConditions}. */
export type TailwindConditions = typeof tailwindConditions;

/**
 * Tailwind v4 starter preset: the utility vocabulary a Tailwind project already
 * knows, resolved by YumCSS's runtime.
 *
 * Colors, fonts, text sizes, weights, leading, tracking, radii, shadows, text
 * shadows, containers, z-indexes, transitions, and the five
 * breakpoint conditions come from the installed `tailwindcss` package through
 * {@link tailwindcssTheme}, so the preset tracks the pinned Tailwind version
 * instead of a transcribed list. Colors keep Tailwind's authored OKLCH values,
 * including the out-of-sRGB stops, because a CSS value is opaque to the runtime
 * and a converted twin would be a second source of truth.
 *
 * Tailwind's `--animate` scale is absent: each entry is a shorthand whose
 * `@keyframes` body lives in Tailwind's own theme CSS rather than in the theme
 * data a preset reads, so the token would name an animation no stylesheet
 * declares and the project owns the body.
 *
 * Bound namespaces resolve to Tailwind's values and emit their `:root` custom
 * properties, matching what Tailwind's own `@theme` output publishes; pass
 * `tokens: "used"` to the stylesheet compiler when a project wants only the
 * tokens its styles reference.
 *
 * @example
 * ```ts
 * import { createCss } from "yumcss/css";
 * import { tailwindPreset } from "yumcss/preset/tailwindcss";
 *
 * const css = createCss(tailwindPreset);
 * css.class({
 *   padding: 4,
 *   color: "$slate-700",
 *   backgroundColor: { base: "$white", _dark: "$slate-950" },
 *   md: { fontSize: "lg" },
 * });
 * ```
 *
 * @category presets
 * @since 0.1.0
 * @see {@link https://tailwindcss.com/docs/theme | Tailwind theme variables}
 */
export const tailwindPreset = define.preset(
	{ config: tailwindCssConfig, tokens: tailwindTokens },
	{
		strict: true,
		conditions: tailwindConditions,
		properties: tailwindProperties,
	},
);

/** The inferred type of {@link tailwindPreset}. */
export type TailwindPreset = typeof tailwindPreset;
