import { define } from "../types/define-preset.export.ts";
import { tokens } from "./tokens.ts";

// The default preset ships no palette, so color properties inline the CSS-wide
// color keywords and inherit the raw CSS value type. A palette preset binds
// `$tokens: "colors"` to its own group instead of reusing this map verbatim.
const colors = tokens.colors;

/**
 * Default CSS property-to-token map used by {@link defaultPreset}.
 *
 * This is data that can be inspected, composed, or replaced by an
 * application-specific preset.
 *
 * @category presets
 * @since 0.1.0
 */
export const presetProperties = define.properties({
	display: true,
	boxShadow: tokens.shadows,
	textShadow: tokens.shadows,
	opacity: true,
	cursor: true,
	pointerEvents: true,
	userSelect: true,
	//
	fontFamily: tokens.typography.fonts,
	fontSize: tokens.typography.fontSizes,
	fontWeight: tokens.typography.fontWeights,
	lineHeight: tokens.typography.lineHeights,
	letterSpacing: tokens.typography.letterSpacings,
	textAlign: true,
	fontStyle: true,
	textTransform: true,
	textDecoration: true,
	textDecorationColor: colors,
	textEmphasisColor: colors,
	textUnderlineOffset: true,
	//
	position: true,
	flexDirection: true,
	flexBasis: true,
	flexShrink: true,
	flexGrow: true,
	flex: true,
	flexWrap: true,
	alignContent: true,
	justifyContent: true,
	justifySelf: true,
	alignItems: true,
	alignSelf: true,
	placeItems: true,
	gridColumn: true,
	gridColumnEnd: true,
	gridColumnStart: true,
	gridRow: true,
	gridRowEnd: true,
	gridRowStart: true,
	gridTemplateColumns: true,
	gridTemplateAreas: true,
	gridTemplateRows: true,
	gridAutoColumns: true,
	gridAutoFlow: true,
	gridAutoRows: true,
	justifyItems: true,
	top: tokens.sizes,
	bottom: tokens.sizes,
	left: tokens.sizes,
	right: tokens.sizes,
	inset: tokens.sizes,
	insetInline: tokens.sizes,
	insetInlineStart: tokens.sizes,
	insetInlineEnd: tokens.sizes,
	insetBlock: tokens.sizes,
	insetBlockStart: tokens.sizes,
	insetBlockEnd: tokens.sizes,
	// base props
	width: tokens.sizes,
	minWidth: tokens.sizes,
	maxWidth: tokens.sizes,
	height: tokens.sizes,
	minHeight: tokens.sizes,
	maxHeight: tokens.sizes,
	whiteSpace: true,
	textOverflow: true,
	lineClamp: true,
	overflow: true,
	overflowX: true,
	overflowY: true,
	overflowWrap: true,
	overscrollBehavior: true,
	visibility: true,
	verticalAlign: true,
	aspectRatio: true,
	resize: true,
	animation: true,
	backdropFilter: true,
	content: true,
	backgroundClip: true,
	backgroundImage: true,
	boxSizing: true,
	clipPath: true,
	filter: true,
	appearance: true,
	scrollMarginTop: true,
	scrollMarginRight: true,
	scrollMarginBottom: true,
	scrollMarginLeft: true,
	scrollbarWidth: true,
	fontVariantNumeric: true,
	// spacing props
	// TODO negative values
	// https://github.com/vanilla-extract-css/vanilla-extract/blob/master/site/src/system/styles/sprinkles.css.ts
	gap: tokens.space,
	rowGap: tokens.space,
	columnGap: tokens.space,
	padding: tokens.space,
	paddingTop: tokens.space,
	paddingBottom: tokens.space,
	paddingLeft: tokens.space,
	paddingRight: tokens.space,
	paddingInline: tokens.space,
	paddingInlineStart: tokens.space,
	paddingInlineEnd: tokens.space,
	paddingBlock: tokens.space,
	paddingBlockStart: tokens.space,
	paddingBlockEnd: tokens.space,
	margin: tokens.space,
	marginTop: tokens.space,
	marginBottom: tokens.space,
	marginLeft: tokens.space,
	marginRight: tokens.space,
	marginInline: tokens.space,
	marginInlineStart: tokens.space,
	marginInlineEnd: tokens.space,
	marginBlock: tokens.space,
	marginBlockStart: tokens.space,
	marginBlockEnd: tokens.space,
	border: tokens.borders,
	borderStyle: true,
	borderTopStyle: true,
	borderRightStyle: true,
	borderBottomStyle: true,
	borderLeftStyle: true,
	borderWidth: tokens.borders,
	borderBlockWidth: tokens.borders,
	borderBlockStartWidth: tokens.borders,
	borderBlockEndWidth: tokens.borders,
	borderInlineWidth: tokens.borders,
	borderInlineStartWidth: tokens.borders,
	borderInlineEndWidth: tokens.borders,
	borderTopWidth: tokens.borders,
	borderRightWidth: tokens.borders,
	borderBottomWidth: tokens.borders,
	borderLeftWidth: tokens.borders,
	borderTop: tokens.borders,
	borderBottom: tokens.borders,
	borderLeft: tokens.borders,
	borderRight: tokens.borders,
	borderCollapse: true,
	borderInlineEndColor: colors,
	borderStartStartRadius: tokens.radii,
	borderStartEndRadius: tokens.radii,
	borderEndStartRadius: tokens.radii,
	borderEndEndRadius: tokens.radii,
	borderRadius: tokens.radii,
	borderTopLeftRadius: tokens.radii,
	borderTopRightRadius: tokens.radii,
	borderBottomLeftRadius: tokens.radii,
	borderBottomRightRadius: tokens.radii,
	outline: tokens.borders,
	outlineStyle: true,
	outlineWidth: tokens.borders,
	outlineOffset: tokens.sizes,
	// colors props
	color: colors,
	background: colors,
	backgroundColor: colors,
	borderColor: colors,
	borderTopColor: colors,
	borderBottomColor: colors,
	borderLeftColor: colors,
	borderRightColor: colors,
	outlineColor: colors,
	fill: colors,
	stroke: colors,
	// transform props
	transform: true,
	transformOrigin: true,
	translate: true,
	rotate: true,
	scale: true,
	// static properties
	zIndex: tokens.zIndices,
	transition: {
		none: "none",
		slow: "all .3s ease, opacity .3s ease",
		fast: "all .15s ease, opacity .15s ease",
	},
	backgroundSize: true,
	backgroundRepeat: true,
	backgroundPosition: true,
	backgroundAttachment: true,
	wordBreak: true,
	objectFit: true,
	objectPosition: true,
	listStyle: true,
	listStyleType: true,
	borderSpacing: true,
});

/** The inferred property-vocabulary type of {@link presetProperties}. */
type PresetProperties = typeof presetProperties;

type StandardPropertyName = Exclude<keyof PresetProperties, "$all">;

/** Common CSS values keep autocomplete without expanding csstype's full keyword graph. */
export type PandwindCssValue = "inherit" | "initial" | "revert" | "revert-layer" | "unset" | number;

type PandwindFinitePropertyValues = {
	display:
		| "block"
		| "contents"
		| "flex"
		| "flow-root"
		| "grid"
		| "inline"
		| "inline-block"
		| "inline-flex"
		| "inline-grid"
		| "list-item"
		| "math"
		| "none"
		| "table"
		| "table-caption"
		| "table-cell"
		| "table-column"
		| "table-column-group"
		| "table-footer-group"
		| "table-header-group"
		| "table-row"
		| "table-row-group";
	alignContent:
		| "baseline"
		| "center"
		| "end"
		| "flex-end"
		| "flex-start"
		| "normal"
		| "safe center"
		| "safe end"
		| "safe start"
		| "space-around"
		| "space-between"
		| "space-evenly"
		| "start"
		| "stretch";
	alignItems:
		| "baseline"
		| "center"
		| "end"
		| "flex-end"
		| "flex-start"
		| "normal"
		| "safe center"
		| "safe end"
		| "safe start"
		| "self-end"
		| "self-start"
		| "start"
		| "stretch";
	alignSelf: PandwindFinitePropertyValues["alignItems"] | "auto";
	appearance: "auto" | "none" | "base-select";
	backgroundAttachment: "fixed" | "local" | "scroll";
	borderCollapse: "collapse" | "separate";
	flexDirection: "column" | "column-reverse" | "row" | "row-reverse";
	flexWrap: "nowrap" | "wrap" | "wrap-reverse";
	objectFit: "contain" | "cover" | "fill" | "none" | "scale-down";
	outlineStyle:
		| "auto"
		| "dashed"
		| "dotted"
		| "double"
		| "groove"
		| "inset"
		| "none"
		| "outset"
		| "ridge"
		| "solid";
	pointerEvents:
		| "all"
		| "auto"
		| "fill"
		| "none"
		| "painted"
		| "stroke"
		| "visible"
		| "visibleFill"
		| "visiblePainted"
		| "visibleStroke";
	position: "absolute" | "fixed" | "relative" | "static" | "sticky";
	resize: "block" | "both" | "horizontal" | "inline" | "none" | "vertical";
	userSelect: "all" | "auto" | "none" | "text";
	visibility: "collapse" | "hidden" | "visible";
	wordBreak: "auto-phrase" | "break-all" | "break-word" | "keep-all" | "normal";
};

type PandwindPropertyValue<TPropertyName extends StandardPropertyName> =
	TPropertyName extends keyof PandwindFinitePropertyValues
		? PandwindFinitePropertyValues[TPropertyName]
		: PandwindCssValue;

type PandwindPropertyContract = {
	[TPropertyName in StandardPropertyName]?: PandwindPropertyValue<TPropertyName>;
};

/**
 * Curated common CSS properties supported by the built-in Pandwind preset.
 *
 * This intentionally exposes a smaller, useful property surface than the
 * complete `csstype` declaration. Import `StandardProperties` from `csstype`
 * directly when a project needs a property outside this catalog.
 */
export type PandwindProperties = PandwindPropertyContract;
