import { dashCase } from "./hash.ts";

/** CSS numeric-value policy shared by runtime class generation and stylesheet emission. */
const UNITLESS_PROPERTIES =
	/^(?:animation-iteration-count|aspect-ratio|border-image-outset|border-image-slice|border-image-width|box-flex|box-flex-group|box-ordinal-group|column-count|columns|flex|flex-grow|flex-shrink|font-weight|grid-area|grid-column|grid-column-end|grid-column-start|grid-row|grid-row-end|grid-row-start|line-clamp|-webkit-line-clamp|line-height|opacity|order|orphans|tab-size|widows|z-index|zoom|fill-opacity|flood-opacity|stop-opacity|stroke-dasharray|stroke-dashoffset|stroke-miterlimit|stroke-opacity|stroke-width|scale)$/;

export const isSafeCssValue = (value: unknown): value is string | number =>
	(typeof value === "string" && value.length > 0 && !value.includes("\u0000")) ||
	Number.isFinite(value);

export function normalizeCssValue(property: string, value: string | number): string {
	if (typeof value !== "number") return value;
	let cssProperty = property;
	for (let index = 0; index < property.length; index++) {
		const code = property.charCodeAt(index);
		if (code >= 65 && code <= 90) {
			cssProperty = dashCase(property);
			break;
		}
	}
	return !cssProperty.startsWith("--") && !UNITLESS_PROPERTIES.test(cssProperty)
		? `${value}px`
		: String(value);
}
