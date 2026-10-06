/** CSS-wide keywords accepted by every property. */
export type CssWideValue = "inherit" | "initial" | "revert" | "revert-layer" | "unset";

/** The scalar CSS values kept in YumCSS's small authored-value vocabulary. */
export type YumCSSCssValue = CssWideValue | number;

/** Color properties that support token opacity modifiers. */
export type YumCSSColorPropertyName =
	| "color"
	| "background"
	| "backgroundColor"
	| "borderColor"
	| "borderTopColor"
	| "borderRightColor"
	| "borderBottomColor"
	| "borderLeftColor"
	| "borderInlineEndColor"
	| "outlineColor"
	| "textDecorationColor"
	| "textEmphasisColor"
	| "fill"
	| "stroke";

type YumCSSColorPropertyValues = {
	[TPropertyName in YumCSSColorPropertyName]: "transparent" | "currentColor";
};

/** CSS properties whose authored values have a bounded, useful keyword set. */
type YumCSSIntrinsicPropertyValues = YumCSSColorPropertyValues & {
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
	alignSelf: YumCSSIntrinsicPropertyValues["alignItems"] | "auto";
	appearance: "auto" | "none" | "base-select";
	aspectRatio: "auto";
	backgroundAttachment: "fixed" | "local" | "scroll";
	backgroundClip: "border-box" | "padding-box" | "content-box" | "text";
	backgroundImage: "none";
	backgroundRepeat: "repeat" | "repeat-x" | "repeat-y" | "no-repeat" | "space" | "round";
	backgroundSize: "auto" | "contain" | "cover";
	borderStyle:
		| "none"
		| "hidden"
		| "dotted"
		| "dashed"
		| "solid"
		| "double"
		| "groove"
		| "ridge"
		| "inset"
		| "outset";
	borderTopStyle: YumCSSIntrinsicPropertyValues["borderStyle"];
	borderRightStyle: YumCSSIntrinsicPropertyValues["borderStyle"];
	borderBottomStyle: YumCSSIntrinsicPropertyValues["borderStyle"];
	borderLeftStyle: YumCSSIntrinsicPropertyValues["borderStyle"];
	borderCollapse: "collapse" | "separate";
	boxSizing: "border-box" | "content-box";
	boxShadow: "none";
	textShadow: "none";
	flexDirection: "column" | "column-reverse" | "row" | "row-reverse";
	flexWrap: "nowrap" | "wrap" | "wrap-reverse";
	fontStyle: "normal" | "italic" | "oblique";
	fontWeight: "normal" | "bold" | "bolder" | "lighter";
	gridAutoFlow: "row" | "column" | "dense" | "row dense" | "column dense";
	justifyContent:
		| "normal"
		| "center"
		| "start"
		| "end"
		| "flex-start"
		| "flex-end"
		| "space-between"
		| "space-around"
		| "space-evenly"
		| "stretch"
		| "safe center"
		| "unsafe center";
	justifyItems: YumCSSIntrinsicPropertyValues["justifyContent"] | "legacy";
	justifySelf: YumCSSIntrinsicPropertyValues["justifyContent"] | "auto";
	lineHeight: "normal";
	margin: "auto";
	marginTop: "auto";
	marginRight: "auto";
	marginBottom: "auto";
	marginLeft: "auto";
	marginInline: "auto";
	marginInlineStart: "auto";
	marginInlineEnd: "auto";
	marginBlock: "auto";
	marginBlockStart: "auto";
	marginBlockEnd: "auto";
	width: "auto" | "min-content" | "max-content" | "fit-content";
	minWidth: "auto" | "min-content" | "max-content" | "fit-content";
	maxWidth: "auto" | "min-content" | "max-content" | "fit-content";
	height: "auto" | "min-content" | "max-content" | "fit-content";
	minHeight: "auto" | "min-content" | "max-content" | "fit-content";
	maxHeight: "auto" | "min-content" | "max-content" | "fit-content";
	top: "auto";
	right: "auto";
	bottom: "auto";
	left: "auto";
	inset: "auto";
	insetInline: "auto";
	insetInlineStart: "auto";
	insetInlineEnd: "auto";
	insetBlock: "auto";
	insetBlockStart: "auto";
	insetBlockEnd: "auto";
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
	overflow: "auto" | "clip" | "hidden" | "overlay" | "scroll" | "visible";
	overflowX: "auto" | "clip" | "hidden" | "overlay" | "scroll" | "visible";
	overflowY: "auto" | "clip" | "hidden" | "overlay" | "scroll" | "visible";
	overflowWrap: "anywhere" | "break-word" | "normal";
	overscrollBehavior: "auto" | "contain" | "none";
	placeContent: YumCSSIntrinsicPropertyValues["justifyContent"];
	placeItems: YumCSSIntrinsicPropertyValues["justifyContent"] | "baseline";
	placeSelf: YumCSSIntrinsicPropertyValues["justifyContent"] | "auto";
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
	scrollbarWidth: "auto" | "thin" | "none";
	textAlign: "start" | "end" | "left" | "right" | "center" | "justify" | "match-parent";
	textDecoration: "none" | "underline" | "overline" | "line-through" | "blink";
	textOverflow: "clip" | "ellipsis";
	textTransform:
		| "none"
		| "capitalize"
		| "uppercase"
		| "lowercase"
		| "full-width"
		| "full-size-kana";
	textUnderlineOffset: "auto";
	userSelect: "all" | "auto" | "none" | "text";
	verticalAlign:
		| "baseline"
		| "sub"
		| "super"
		| "text-top"
		| "text-bottom"
		| "middle"
		| "top"
		| "bottom";
	visibility: "collapse" | "hidden" | "visible";
	whiteSpace: "normal" | "pre" | "nowrap" | "pre-wrap" | "pre-line" | "break-spaces";
	wordBreak: "auto-phrase" | "break-all" | "break-word" | "keep-all" | "normal";
	zIndex: "auto";
};

/** CSS-wide, numeric, and property-aware intrinsic values for a CSS property. */
export type YumCSSPropertyValue<TPropertyName extends string> =
	| YumCSSCssValue
	| (TPropertyName extends keyof YumCSSIntrinsicPropertyValues
			? YumCSSIntrinsicPropertyValues[TPropertyName]
			: never);
