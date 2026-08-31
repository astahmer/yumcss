/** CSS numeric-value policy shared by runtime class generation and stylesheet emission. */
const UNITLESS_PROPERTIES = new Set([
	"animation-iteration-count",
	"aspect-ratio",
	"border-image-outset",
	"border-image-slice",
	"border-image-width",
	"box-flex",
	"box-flex-group",
	"box-ordinal-group",
	"column-count",
	"columns",
	"flex",
	"flex-grow",
	"flex-shrink",
	"font-weight",
	"grid-area",
	"grid-column",
	"grid-column-end",
	"grid-column-start",
	"grid-row",
	"grid-row-end",
	"grid-row-start",
	"line-clamp",
	"-webkit-line-clamp",
	"line-height",
	"opacity",
	"order",
	"orphans",
	"tab-size",
	"widows",
	"z-index",
	"zoom",
	"fill-opacity",
	"flood-opacity",
	"stop-opacity",
	"stroke-dasharray",
	"stroke-dashoffset",
	"stroke-miterlimit",
	"stroke-opacity",
	"stroke-width",
	"scale",
]);

export function normalizeCssValue(property: string, value: string | number): string {
	const cssProperty = property.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
	return typeof value === "number" &&
		!cssProperty.startsWith("--") &&
		!UNITLESS_PROPERTIES.has(cssProperty)
		? `${value}px`
		: String(value);
}
