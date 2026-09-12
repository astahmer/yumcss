/**
 * Optional authored property aliases for the CSS backend.
 *
 * This catalog lives in its own entry point so the normal `pandwind/css`
 * import does not pay for shorthand support. Pass it as `propertyAliases` to
 * the CSS factory, runtime factory, stylesheet compiler, or CSS extractor.
 * Extend it with a spread when an application has additional aliases.
 *
 * @example
 * ```ts
 * import { createCss } from "pandwind/css";
 * import { cssShorthands } from "pandwind/css/shorthands";
 *
 * const css = createCss({ propertyAliases: cssShorthands });
 * css.class({ bg: "red" });
 * ```
 *
 * @category styling
 * @since 0.1.0
 */
export const cssShorthands = {
	align: "alignItems",
	bg: "background",
	bgColor: "backgroundColor",
	flexDir: "flexDirection",
	fs: "fontSize",
	fw: "fontWeight",
	h: "height",
	insetX: "insetInline",
	insetY: "insetBlock",
	justify: "justifyContent",
	lh: "lineHeight",
	m: "margin",
	mb: "marginBottom",
	me: "marginInlineEnd",
	ml: "marginLeft",
	ms: "marginInlineStart",
	mt: "marginTop",
	mr: "marginRight",
	mx: "marginInline",
	my: "marginBlock",
	minH: "minHeight",
	minW: "minWidth",
	maxH: "maxHeight",
	maxW: "maxWidth",
	p: "padding",
	pb: "paddingBottom",
	pe: "paddingInlineEnd",
	pl: "paddingLeft",
	ps: "paddingInlineStart",
	pt: "paddingTop",
	pr: "paddingRight",
	px: "paddingInline",
	py: "paddingBlock",
	pos: "position",
	rounded: "borderRadius",
	shadow: "boxShadow",
	tracking: "letterSpacing",
	w: "width",
	z: "zIndex",
};
