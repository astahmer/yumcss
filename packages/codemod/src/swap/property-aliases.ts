/** Canonical CSS property aliases shared by every style dialect. */
export const CSS_PROPERTY_ALIASES: ReadonlyMap<string, string> = new Map([
	["paddingX", "paddingInline"],
	["paddingY", "paddingBlock"],
	["marginX", "marginInline"],
	["marginY", "marginBlock"],
	["scrollMarginX", "scrollMarginInline"],
	["scrollMarginY", "scrollMarginBlock"],
	["scrollPaddingX", "scrollPaddingInline"],
	["scrollPaddingY", "scrollPaddingBlock"],
]);
