import { define } from "../types/define-preset.export.ts";
import type { TokenGroupKey } from "../types/typings.ts";
import { presetConditions } from "./conditions.ts";
import { pandaTheme } from "./generated/panda-theme.ts";
import { presetProperties, type PandwindCssValue, type PandwindProperties } from "./properties.ts";

const {
	breakpoints,
	conditions: pandaUpstreamConditions,
	tokens: pandaStaticTokens,
	transitionProperties,
	transitions,
} = pandaTheme;

/**
 * Panda CSS token scales as a Pandwind token catalog.
 *
 * The scales are Panda's `theme.tokens` and its two transition keyword
 * vocabularies, read from the installed package through its own config
 * resolver, so the catalog tracks the pinned Panda version instead of a
 * transcribed list. Color keys are Panda's own token paths (`red.500`), so the
 * authored `color: "red.500"` is the spelling Panda itself writes and no
 * second, sigiled spelling of the same token exists.
 *
 * Panda's `blurs` scale is deliberately absent: Panda reaches it only
 * through its `blur` and `backdropBlur` utilities, which write a
 * `--blur` custom property rather than a CSS property, so no property
 * binding could read the group.
 *
 * `theme.keyframes`, `theme.textStyles`,
 * `theme.containerSizes`, the patterns, and the recipes are absent as well, and
 * the `animations` scale goes with them: an `animation` shorthand whose
 * `@keyframes` body no stylesheet declares is a dangling reference, so a
 * project that animates writes the shorthand and the body it names.
 *
 * @category tokens
 * @since 0.1.0
 */
export const pandaTokens = define.tokens({
	...pandaStaticTokens,
	transitions,
	transitionProperties,
});

/** The inferred type of {@link pandaTokens}. */
export type PandaTokens = typeof pandaTokens;

type PandaTokenGroup = TokenGroupKey<PandaTokens>;

// Every bound scale keeps raw CSS available: a Panda project writes arbitrary
// values for spacing and sizing often enough that a token-only vocabulary
// would reject ordinary styles, which is the same reason `defaultPreset`
// inherits on colors.
const boundTo = (group: PandaTokenGroup) => ({ $tokens: group, $strict: false }) as const;
const strictBoundTo = (group: PandaTokenGroup) => ({ $tokens: group, $strict: true }) as const;

/**
 * Property vocabulary of {@link pandaPreset}.
 *
 * It is {@link presetProperties} with every scale Panda's utilities read
 * rebound to the matching group from {@link pandaTokens}. The offsets and the
 * scroll margin and scroll padding families follow Panda's spacing scale rather
 * than Pandwind's sizing scale, and `outlineOffset` and
 * `scrollbarWidth` follow the scale Panda's own utility reads them from.
 *
 * `borderWidth*`, `outlineWidth`, `zIndex`,
 * `cursor`, `opacity`, `filter`, and `backdropFilter` stay on the stock
 * Pandwind groups: Panda gives those properties a length or keyword utility
 * rather than a token scale, and `pandaTokens.borders` holds the
 * `none` keyword that is only valid for the `border` shorthand.
 *
 * @category presets
 * @since 0.1.0
 */
export const pandaProperties = define.properties({
	...presetProperties,
	boxShadow: boundTo("shadows"),
	textShadow: boundTo("shadows"),

	fontFamily: boundTo("fonts"),

	fontSize: boundTo("fontSizes"),

	fontWeight: boundTo("fontWeights"),

	lineHeight: boundTo("lineHeights"),

	letterSpacing: boundTo("letterSpacings"),

	borderBottomLeftRadius: boundTo("radii"),
	borderBottomRightRadius: boundTo("radii"),
	borderEndEndRadius: boundTo("radii"),
	borderEndStartRadius: boundTo("radii"),
	borderRadius: boundTo("radii"),
	borderStartEndRadius: boundTo("radii"),
	borderStartStartRadius: boundTo("radii"),
	borderTopLeftRadius: boundTo("radii"),
	borderTopRightRadius: boundTo("radii"),

	border: boundTo("borders"),
	borderBlock: boundTo("borders"),
	borderBlockEnd: boundTo("borders"),
	borderBlockStart: boundTo("borders"),
	borderBottom: boundTo("borders"),
	borderInline: boundTo("borders"),
	borderInlineEnd: boundTo("borders"),
	borderInlineStart: boundTo("borders"),
	borderLeft: boundTo("borders"),
	borderRight: boundTo("borders"),
	borderTop: boundTo("borders"),
	outline: boundTo("borders"),

	blockSize: boundTo("sizes"),
	flexBasis: boundTo("sizes"),
	height: boundTo("sizes"),
	inlineSize: boundTo("sizes"),
	maxBlockSize: boundTo("sizes"),
	maxHeight: boundTo("sizes"),
	maxInlineSize: boundTo("sizes"),
	maxWidth: boundTo("sizes"),
	minBlockSize: boundTo("sizes"),
	minHeight: boundTo("sizes"),
	minInlineSize: boundTo("sizes"),
	minWidth: boundTo("sizes"),
	scrollbarWidth: boundTo("sizes"),
	width: boundTo("sizes"),

	borderSpacing: boundTo("spacing"),
	bottom: boundTo("spacing"),
	columnGap: boundTo("spacing"),
	gap: boundTo("spacing"),
	gridColumnGap: boundTo("spacing"),
	gridGap: boundTo("spacing"),
	gridRowGap: boundTo("spacing"),
	inset: boundTo("spacing"),
	insetBlock: boundTo("spacing"),
	insetBlockEnd: boundTo("spacing"),
	insetBlockStart: boundTo("spacing"),
	insetInline: boundTo("spacing"),
	insetInlineEnd: boundTo("spacing"),
	insetInlineStart: boundTo("spacing"),
	left: boundTo("spacing"),
	margin: boundTo("spacing"),
	marginBlock: boundTo("spacing"),
	marginBlockEnd: boundTo("spacing"),
	marginBlockStart: boundTo("spacing"),
	marginBottom: boundTo("spacing"),
	marginInline: boundTo("spacing"),
	marginInlineEnd: boundTo("spacing"),
	marginInlineStart: boundTo("spacing"),
	marginLeft: boundTo("spacing"),
	marginRight: boundTo("spacing"),
	marginTop: boundTo("spacing"),
	outlineOffset: boundTo("spacing"),
	padding: boundTo("spacing"),
	paddingBlock: boundTo("spacing"),
	paddingBlockEnd: boundTo("spacing"),
	paddingBlockStart: boundTo("spacing"),
	paddingBottom: boundTo("spacing"),
	paddingInline: boundTo("spacing"),
	paddingInlineEnd: boundTo("spacing"),
	paddingInlineStart: boundTo("spacing"),
	paddingLeft: boundTo("spacing"),
	paddingRight: boundTo("spacing"),
	paddingTop: boundTo("spacing"),
	right: boundTo("spacing"),
	rowGap: boundTo("spacing"),
	scrollMargin: boundTo("spacing"),
	scrollMarginBlock: boundTo("spacing"),
	scrollMarginBlockEnd: boundTo("spacing"),
	scrollMarginBlockStart: boundTo("spacing"),
	scrollMarginBottom: boundTo("spacing"),
	scrollMarginInline: boundTo("spacing"),
	scrollMarginInlineEnd: boundTo("spacing"),
	scrollMarginInlineStart: boundTo("spacing"),
	scrollMarginLeft: boundTo("spacing"),
	scrollMarginRight: boundTo("spacing"),
	scrollMarginTop: boundTo("spacing"),
	scrollPadding: boundTo("spacing"),
	scrollPaddingBlock: boundTo("spacing"),
	scrollPaddingBlockEnd: boundTo("spacing"),
	scrollPaddingBlockStart: boundTo("spacing"),
	scrollPaddingBottom: boundTo("spacing"),
	scrollPaddingInline: boundTo("spacing"),
	scrollPaddingInlineEnd: boundTo("spacing"),
	scrollPaddingInlineStart: boundTo("spacing"),
	scrollPaddingLeft: boundTo("spacing"),
	scrollPaddingRight: boundTo("spacing"),
	scrollPaddingTop: boundTo("spacing"),
	scrollSnapMargin: boundTo("spacing"),
	scrollSnapMarginBottom: boundTo("spacing"),
	scrollSnapMarginLeft: boundTo("spacing"),
	scrollSnapMarginRight: boundTo("spacing"),
	scrollSnapMarginTop: boundTo("spacing"),
	textIndent: boundTo("spacing"),
	top: boundTo("spacing"),

	WebkitTextFillColor: strictBoundTo("colors"),
	accentColor: strictBoundTo("colors"),
	background: strictBoundTo("colors"),
	backgroundColor: strictBoundTo("colors"),
	borderBlockColor: strictBoundTo("colors"),
	borderBlockEndColor: strictBoundTo("colors"),
	borderBlockStartColor: strictBoundTo("colors"),
	borderBottomColor: strictBoundTo("colors"),
	borderColor: strictBoundTo("colors"),
	borderInlineColor: strictBoundTo("colors"),
	borderInlineEndColor: strictBoundTo("colors"),
	borderInlineStartColor: strictBoundTo("colors"),
	borderLeftColor: strictBoundTo("colors"),
	borderRightColor: strictBoundTo("colors"),
	borderTopColor: strictBoundTo("colors"),
	caretColor: strictBoundTo("colors"),
	color: strictBoundTo("colors"),
	fill: strictBoundTo("colors"),
	outlineColor: strictBoundTo("colors"),
	scrollbarColor: strictBoundTo("colors"),
	stroke: strictBoundTo("colors"),
	textDecorationColor: strictBoundTo("colors"),
	textEmphasisColor: strictBoundTo("colors"),

	aspectRatio: boundTo("aspectRatios"),

	animationDelay: boundTo("durations"),
	animationDuration: boundTo("durations"),
	transitionDelay: boundTo("durations"),
	transitionDuration: boundTo("durations"),

	animationTimingFunction: boundTo("easings"),
	transitionTimingFunction: boundTo("easings"),

	// Panda's transition utilities name their keywords directly instead of
	// referencing a token scale, so the derivation above cannot see them and
	// both vocabularies are bound here.
	transition: boundTo("transitions"),
	transitionProperty: boundTo("transitionProperties"),
});

/** The inferred property-vocabulary type of {@link pandaProperties}. */
export type PandaProperties = typeof pandaProperties;

/** Names {@link pandaProperties} binds beyond the stock Pandwind catalog. */
type PandaExtraProperty = Exclude<keyof PandaProperties, keyof PandwindProperties | "$all">;

/**
 * Property contract of {@link pandaPreset}.
 *
 * The extra keys are derived from the property map instead of listed by hand,
 * because `define.preset` types a property it cannot find in the config
 * as "Not a part of the `TConfig` interface": a hand-written list that
 * misses one binding would make the preset reject a property it binds at
 * runtime.
 */
type PandaCssConfig = PandwindProperties & {
	[Property in PandaExtraProperty]?: PandwindCssValue;
};

const pandaCssConfig: PandaCssConfig = {};

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
 * Condition map of {@link pandaPreset}.
 *
 * The stock Pandwind conditions, overridden by Panda's own map where the two
 * disagree (Panda adds `data-*` and element states such as
 * `_placeholder`, `_icon`, and `_open`, and its
 * `_dark` and `_light` conditions key off the classes a Panda
 * project toggles), plus Panda's five breakpoints. The `px` widths keep
 * the stylesheet ordering policy able to place narrower rules before wider ones
 * regardless of scan order.
 *
 * @category presets
 * @since 0.1.0
 */
export const pandaConditions = define.conditions({
	...presetConditions,
	...pandaUpstreamConditions,
	...breakpointConditions,
});

/** The inferred condition-key type of {@link pandaConditions}. */
export type PandaConditions = typeof pandaConditions;

/**
 * Panda CSS starter preset: the token scales, conditions, and breakpoints a
 * Panda project already knows, resolved by Pandwind's runtime.
 *
 * Values come from the installed Panda package through {@link pandaTokens}, so
 * the preset tracks the pinned Panda version instead of a transcribed list.
 * Bound scales resolve to Panda's values and emit their `:root` custom
 * properties; pass `tokens: "used"` to the stylesheet compiler when a
 * project wants only the tokens its styles reference.
 *
 * @example
 * ```ts
 * import { createCss } from "pandwind/css";
 * import { pandaPreset } from "pandwind/preset/panda";
 *
 * const css = createCss(pandaPreset);
 * css.class({
 *   padding: 4,
 *   color: "red.500",
 *   transition: "colors",
 *   md: { fontSize: "lg" },
 * });
 * ```
 *
 * @category presets
 * @since 0.1.0
 * @see {@link https://panda-css.com/docs/theming/tokens | Panda tokens}
 */
export const pandaPreset = define.preset(
	{ config: pandaCssConfig, tokens: pandaTokens },
	{
		strict: true,
		conditions: pandaConditions,
		properties: pandaProperties,
	},
);

/** The inferred type of {@link pandaPreset}. */
export type PandaPreset = typeof pandaPreset;
