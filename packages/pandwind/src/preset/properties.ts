import type { StandardProperties as CsstypeStandardProperties } from "csstype";
import { defineProperties } from "../types/define-preset.ts";
import { tokens } from "./tokens.ts";

/**
 * Closed vocabulary for the standard `display` keywords.
 *
 * `csstype` deliberately accepts an arbitrary string for `display` so callers
 * can author future or multi-keyword syntax. Pandwind's preset lane is the
 * typed/static lane, so keep the common standard spellings explicit here.
 */
const standardDisplayValues = [
	"-moz-initial",
	"-ms-flexbox",
	"-ms-grid",
	"-ms-inline-flexbox",
	"-ms-inline-grid",
	"-webkit-box",
	"-webkit-flex",
	"-webkit-inline-flex",
	"block",
	"block flex",
	"block flow",
	"block flow-root",
	"block grid",
	"block ruby",
	"contents",
	"flex",
	"flow",
	"flow-root",
	"grid",
	"inherit",
	"initial",
	"inline",
	"inline-block",
	"inline flex",
	"inline-flex",
	"inline flow",
	"inline flow-root",
	"inline-grid",
	"inline-list-item",
	"inline ruby",
	"inline-table",
	"list-item",
	"none",
	"revert",
	"revert-layer",
	"ruby",
	"ruby-base",
	"ruby-base-container",
	"ruby-text",
	"ruby-text-container",
	"run-in",
	"table",
	"table-caption",
	"table-cell",
	"table-column",
	"table-column-group",
	"table-footer-group",
	"table-header-group",
	"table-row",
	"table-row-group",
	"unset",
] as const;

/**
 * Default CSS property-to-token map used by {@link pandwindPreset}.
 *
 * This is data that can be inspected, composed, or replaced by an
 * application-specific preset.
 *
 * @category presets
 * @since 0.1.0
 */
export const presetProperties = defineProperties({
	display: true,
	boxShadow: tokens.shadows,
	textShadow: tokens.shadows,
	opacity: {
		"0": "0",
		"0.4": "0.6",
		"0.6": "0.6",
		"1": "1",
	},
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
	textDecorationColor: tokens.colors,
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
	gridTemplateColumns: true,
	gridAutoRows: true,
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
	appearance: true,
	scrollMarginTop: true,
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
	borderInlineEndColor: tokens.colors,
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
	color: tokens.colors,
	background: tokens.colors,
	backgroundColor: tokens.colors,
	borderColor: tokens.colors,
	borderTopColor: tokens.colors,
	borderBottomColor: tokens.colors,
	borderLeftColor: tokens.colors,
	borderRightColor: tokens.colors,
	outlineColor: tokens.colors,
	fill: tokens.colors,
	stroke: tokens.colors,
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

/**
 * Curated common CSS properties supported by the built-in Pandwind preset.
 *
 * This intentionally exposes a smaller, useful property surface than the
 * complete `csstype` declaration. Import `StandardProperties` from `csstype`
 * directly when a project needs a property outside this catalog.
 */
export type PandwindProperties<TLength = (string & {}) | 0, TTime = string & {}> = Omit<
	Pick<CsstypeStandardProperties<TLength, TTime>, StandardPropertyName>,
	"display"
> & {
	display?: (typeof standardDisplayValues)[number];
};
