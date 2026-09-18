import { define } from "../types/define-preset.export.ts";
import type { TokenGroupKey } from "../types/typings.ts";
import { presetConditions } from "./conditions.ts";
import { tailwindcssTheme } from "./generated/tailwindcss-theme.ts";
import { presetProperties, type PandwindProperties } from "./properties.ts";

const tailwindCssConfig: PandwindProperties = {};

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
 * Tailwind v4 theme namespaces as a Pandwind token catalog.
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

// Every bound namespace keeps raw CSS available: a Tailwind project writes
// arbitrary values often enough that a token-only vocabulary would reject
// ordinary styles, which is the same reason `defaultPreset` inherits on colors.
const boundTo = (group: TailwindTokenGroup) => ({ $tokens: group, $strict: false }) as const;
const strictBoundTo = (group: TailwindTokenGroup) => ({ $tokens: group, $strict: true }) as const;

/**
 * Property vocabulary of {@link tailwindPreset}.
 *
 * It is {@link presetProperties} with every scale Tailwind v4 owns rebound to
 * the matching namespace from {@link tailwindcssTheme}. Spacing, sizing, and
 * border widths keep the stock Pandwind groups: Tailwind v4 dropped its
 * explicit space scale for `--spacing: 0.25rem` multiplied by the utility
 * number, and the stock 4px grid resolves to the same value on every step that
 * scale enumerates.
 *
 * @category presets
 * @since 0.1.0
 */
export const tailwindProperties = define.properties({
	...presetProperties,
	boxShadow: boundTo("shadows"),
	textShadow: boundTo("textShadows"),
	fontFamily: boundTo("fontFamilies"),
	fontSize: boundTo("fontSizes"),
	fontWeight: boundTo("fontWeights"),
	lineHeight: boundTo("lineHeights"),
	letterSpacing: boundTo("letterSpacings"),
	borderRadius: boundTo("radii"),
	borderTopLeftRadius: boundTo("radii"),
	borderTopRightRadius: boundTo("radii"),
	borderBottomLeftRadius: boundTo("radii"),
	borderBottomRightRadius: boundTo("radii"),
	borderStartStartRadius: boundTo("radii"),
	borderStartEndRadius: boundTo("radii"),
	borderEndStartRadius: boundTo("radii"),
	borderEndEndRadius: boundTo("radii"),
	minWidth: boundTo("containers"),
	maxWidth: boundTo("containers"),
	zIndex: boundTo("zIndices"),
	transition: boundTo("transitions"),
	color: strictBoundTo("colors"),
	background: strictBoundTo("colors"),
	backgroundColor: strictBoundTo("colors"),
	borderColor: strictBoundTo("colors"),
	borderTopColor: strictBoundTo("colors"),
	borderRightColor: strictBoundTo("colors"),
	borderBottomColor: strictBoundTo("colors"),
	borderLeftColor: strictBoundTo("colors"),
	borderInlineEndColor: strictBoundTo("colors"),
	outlineColor: strictBoundTo("colors"),
	textDecorationColor: strictBoundTo("colors"),
	textEmphasisColor: strictBoundTo("colors"),
	fill: strictBoundTo("colors"),
	stroke: strictBoundTo("colors"),
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
 * The stock Pandwind conditions plus Tailwind's five breakpoints as min-width
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
 * knows, resolved by Pandwind's runtime.
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
 * import { createCss } from "pandwind/css";
 * import { tailwindPreset } from "pandwind/preset/tailwindcss";
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
