import { define } from "../types/define-preset.export.ts";
import type { TokenGroupKey } from "../types/typings.ts";
import { presetConditions } from "./conditions.ts";
import { chakraTheme } from "./generated/chakra-theme.ts";
import { presetProperties, type PandwindCssValue, type PandwindProperties } from "./properties.ts";

const {
	breakpoints,
	conditions: chakraConditionScale,
	semanticTokens: chakraSemanticTokens,
	tokens: chakraStaticTokens,
	transitionProperties,
	transitions,
} = chakraTheme;

const { _hover: chakraHover, ...chakraScalarConditions } = chakraConditionScale;

// Readonly tuples are not assignable to the `string[]` an `AnyConditions`
// entry may hold. Chakra publishes exactly one list-valued condition, so the
// map is rebuilt with a mutable copy rather than widening the public type for
// every preset.
const chakraUpstreamConditions = {
	...chakraScalarConditions,
	_hover: [...chakraHover],
};

// Chakra's provider writes the color mode as a `light` / `dark` class, so the
// semantic layer switches on the same selectors Chakra's own conditions use.
// `base` is the unconditional layer and takes the empty selector.
const chakraTokenConditions = {
	base: "",
	_light: ":root &, .light &",
	_dark: ".dark &, .dark .chakra-theme:not(.light) &",
} as const;

/**
 * Chakra UI v3 token scales as a Pandwind token catalog.
 *
 * The static scales are Chakra's `theme.tokens` and the color-mode roles are
 * `theme.semanticTokens`, both read from the installed package through its own
 * `createSystem`, so the catalog tracks the pinned `@chakra-ui/react` version
 * instead of a transcribed list. The semantic entries keep their light / dark
 * pairs as condition-aware tokens, which is what lets one bound property
 * resolve to a different value per color mode without a runtime theme object.
 *
 * Chakra's `blurs` scale is deliberately absent: Chakra reaches it only
 * through its `blur` utility, which writes a `--blur` custom property rather
 * than a CSS property, so no property binding could read the group.
 *
 * Chakra's `animations` scale is absent as well: each entry is a shorthand
 * whose `@keyframes` body Chakra keeps in its own `theme.keyframes`, which this
 * preset does not ship, so the token would name an animation no stylesheet
 * declares and the project owns the body.
 *
 * `transitions` and `transitionProperties` are composed rather than read:
 * Chakra reaches both scales through a utility whose members are keyword lists.
 * The members of `transition` each expand to a property list, a duration, and
 * an easing, which the generator joins into the single shorthand
 * {@link chakraProperties} binds; the members of `transitionProperty` already
 * are the list a project wants, so they ship verbatim.
 *
 * @category tokens
 * @since 0.1.0
 */
export const chakraTokens = define
	.tokens({ ...chakraStaticTokens, transitions, transitionProperties })
	.defineSemanticTokens(chakraTokenConditions, chakraSemanticTokens);

/** The inferred type of {@link chakraTokens}. */
export type ChakraTokens = typeof chakraTokens;

type ChakraTokenGroup = TokenGroupKey<ChakraTokens>;

// Every bound scale keeps raw CSS available: a Chakra project writes arbitrary
// values for spacing and sizing often enough that a token-only vocabulary
// would reject ordinary styles, which is the same reason `defaultPreset`
// inherits on colors.
const boundTo = (group: ChakraTokenGroup) => ({ $tokens: group, $strict: false }) as const;
const strictBoundTo = (group: ChakraTokenGroup) => ({ $tokens: group, $strict: true }) as const;

/**
 * Property vocabulary of {@link chakraPreset}.
 *
 * It is {@link presetProperties} with every scale Chakra owns rebound to the
 * matching group from {@link chakraTokens}: colors, shadows, typography,
 * radii, composite borders, sizing, spacing, z-index, aspect ratios,
 * transitions, cursors, durations, and easings. The offsets and the
 * scroll margin, scroll padding, and their block and inline forms follow
 * Chakra's spacing scale rather than Pandwind's sizing scale, and
 * `borderWidth*`, `outline`, and `outlineWidth` stay on the stock Pandwind
 * groups on purpose: Chakra gives those properties a plain length or keyword
 * utility, not a composite border value, and `chakraTokens.borders` holds
 * `1px solid` strings that are only valid for the `border` shorthand.
 *
 * Chakra reads the logical scroll-margin forms (`scrollMarginInline`,
 * `scrollMarginBlock`) and the logical scroll-padding longhands
 * (`scrollPaddingInlineStart`, `scrollPaddingBlockStart`) as raw lengths, so
 * those stay unbound and accept authored CSS only.
 *
 * @category presets
 * @since 0.1.0
 */
export const chakraProperties = define.properties({
	...presetProperties,
	boxShadow: boundTo("shadows"),
	textShadow: boundTo("shadows"),
	fontFamily: boundTo("fonts"),
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
	border: boundTo("borders"),
	borderTop: boundTo("borders"),
	borderRight: boundTo("borders"),
	borderBottom: boundTo("borders"),
	borderLeft: boundTo("borders"),
	width: boundTo("sizes"),
	minWidth: boundTo("sizes"),
	maxWidth: boundTo("sizes"),
	height: boundTo("sizes"),
	minHeight: boundTo("sizes"),
	maxHeight: boundTo("sizes"),
	flexBasis: boundTo("sizes"),
	top: boundTo("spacing"),
	bottom: boundTo("spacing"),
	left: boundTo("spacing"),
	right: boundTo("spacing"),
	inset: boundTo("spacing"),
	insetInline: boundTo("spacing"),
	insetInlineStart: boundTo("spacing"),
	insetInlineEnd: boundTo("spacing"),
	insetBlock: boundTo("spacing"),
	insetBlockStart: boundTo("spacing"),
	insetBlockEnd: boundTo("spacing"),
	gap: boundTo("spacing"),
	rowGap: boundTo("spacing"),
	columnGap: boundTo("spacing"),
	padding: boundTo("spacing"),
	paddingTop: boundTo("spacing"),
	paddingBottom: boundTo("spacing"),
	paddingLeft: boundTo("spacing"),
	paddingRight: boundTo("spacing"),
	paddingInline: boundTo("spacing"),
	paddingInlineStart: boundTo("spacing"),
	paddingInlineEnd: boundTo("spacing"),
	paddingBlock: boundTo("spacing"),
	paddingBlockStart: boundTo("spacing"),
	paddingBlockEnd: boundTo("spacing"),
	margin: boundTo("spacing"),
	marginTop: boundTo("spacing"),
	marginBottom: boundTo("spacing"),
	marginLeft: boundTo("spacing"),
	marginRight: boundTo("spacing"),
	marginInline: boundTo("spacing"),
	marginInlineStart: boundTo("spacing"),
	marginInlineEnd: boundTo("spacing"),
	marginBlock: boundTo("spacing"),
	marginBlockStart: boundTo("spacing"),
	marginBlockEnd: boundTo("spacing"),
	borderSpacing: boundTo("spacing"),
	scrollMargin: boundTo("spacing"),
	scrollMarginTop: boundTo("spacing"),
	scrollMarginRight: boundTo("spacing"),
	scrollMarginBottom: boundTo("spacing"),
	scrollMarginLeft: boundTo("spacing"),
	scrollPadding: boundTo("spacing"),
	scrollPaddingTop: boundTo("spacing"),
	scrollPaddingRight: boundTo("spacing"),
	scrollPaddingBottom: boundTo("spacing"),
	scrollPaddingLeft: boundTo("spacing"),
	scrollPaddingInline: boundTo("spacing"),
	scrollPaddingBlock: boundTo("spacing"),
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
	zIndex: boundTo("zIndex"),
	aspectRatio: boundTo("aspectRatios"),
	cursor: boundTo("cursor"),
	transition: boundTo("transitions"),
	transitionProperty: boundTo("transitionProperties"),
	transitionDuration: boundTo("durations"),
	transitionTimingFunction: boundTo("easings"),
});

/** The inferred property-vocabulary type of {@link chakraProperties}. */
export type ChakraProperties = typeof chakraProperties;

/** Names {@link chakraProperties} binds beyond the stock Pandwind catalog. */
type ChakraExtraProperty = Exclude<keyof ChakraProperties, keyof PandwindProperties | "$all">;

/**
 * Property contract of {@link chakraPreset}.
 *
 * The extra keys are derived from the property map instead of listed by hand,
 * because `define.preset` types a property it cannot find in the config as
 * "Not a part of the `TConfig` interface": a hand-written list that misses one
 * binding would make the preset reject a property it binds at runtime.
 */
type ChakraCssConfig = PandwindProperties & {
	[Property in ChakraExtraProperty]?: PandwindCssValue;
};

const chakraCssConfig: ChakraCssConfig = {};

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
 * Condition map of {@link chakraPreset}.
 *
 * The stock Pandwind conditions, overridden by Chakra's own map where the two
 * disagree (Chakra excludes `:disabled` from `_hover`, and `data-*` states
 * such as `_complete` are Chakra-specific), plus Chakra's five breakpoints and
 * the light / dark conditions the semantic tokens switch on. The `px` widths
 * keep the stylesheet ordering policy able to place narrower rules before
 * wider ones regardless of scan order.
 *
 * @category presets
 * @since 0.1.0
 */
export const chakraConditions = define.conditions({
	...presetConditions,
	...chakraUpstreamConditions,
	...breakpointConditions,
	...chakraTokenConditions,
});

/** The inferred condition-key type of {@link chakraConditions}. */
export type ChakraConditions = typeof chakraConditions;

// Every color root Chakra accepts as a `colorPalette` value. The source paths
// carry the `$` sigil the generated keys use, and the palette names stay
// Chakra's own, because that is what a project writes for `colorPalette`.
// `gray` is last because the last palette wins the virtual `colorPalette.*`
// names, and gray is the palette Chakra's own components inherit by default.
const chakraColorPalettes = chakraTokens.defineColorPalettes({
	transparent: "colors.$transparent",
	current: "colors.$current",
	black: "colors.$black",
	white: "colors.$white",
	whiteAlpha: "colors.$whiteAlpha",
	blackAlpha: "colors.$blackAlpha",
	bg: "colors.$bg",
	fg: "colors.$fg",
	border: "colors.$border",
	red: "colors.$red",
	orange: "colors.$orange",
	yellow: "colors.$yellow",
	green: "colors.$green",
	teal: "colors.$teal",
	blue: "colors.$blue",
	cyan: "colors.$cyan",
	purple: "colors.$purple",
	pink: "colors.$pink",
	gray: "colors.$gray",
});

/**
 * Chakra UI v3 starter preset: the token names and color modes a Chakra
 * project already knows, resolved by Pandwind's runtime.
 *
 * Values come from the installed `@chakra-ui/react` package through
 * {@link chakraTokens}, so the preset tracks the pinned Chakra version instead
 * of a transcribed list. The semantic colors keep their light / dark pairs, so
 * a bound property emits `:root` and `.dark` declarations and switches with
 * Chakra's own color-mode class.
 *
 * Bound scales resolve to Chakra's values and emit their custom properties;
 * pass `tokens: "used"` to the stylesheet compiler when a project wants only
 * the tokens its styles reference.
 *
 * @example
 * ```ts
 * import { createCss } from "pandwind/css";
 * import { chakraPreset } from "pandwind/preset/chakra";
 *
 * const css = createCss(chakraPreset);
 * css.class({
 *   padding: 4,
 *   color: "$gray.700",
 *   backgroundColor: "$bg",
 *   colorPalette: "blue",
 *   transition: "colors",
 *   md: { fontSize: "lg" },
 * });
 * ```
 *
 * @category presets
 * @since 0.1.0
 * @see {@link https://chakra-ui.com/docs/theming/tokens | Chakra tokens}
 */
export const chakraPreset = define.preset(
	{ config: chakraCssConfig, tokens: chakraTokens },
	{
		strict: true,
		conditions: chakraConditions,
		properties: chakraProperties,
		colorPalettes: chakraColorPalettes,
	},
);

/** The inferred type of {@link chakraPreset}. */
export type ChakraPreset = typeof chakraPreset;
