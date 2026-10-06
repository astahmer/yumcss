import { normalizeCssValue } from "../css/value-normalization.ts";
import type { StyleObject } from "../types/typings.ts";
import type { DesignModuleAdapter, TokenLookup } from "./contracts.ts";
import { toLength } from "./module-values.ts";

/* ---------------------------------------------------------------------------
 * $text — the type
 * -------------------------------------------------------------------------*/

const TEXT_CASE: Record<string, string> = {
	asTyped: "none",
	upper: "uppercase",
	lower: "lowercase",
	title: "capitalize",
};
const TEXT_ALIGN = new Set(["left", "center", "right", "justify"]);
const DECORATION_LINES = new Set(["none", "underline", "strikethrough"]);
const DECORATION_STYLES = new Set(["solid", "double", "dotted", "dashed", "wavy"]);

const resolveText = (props: Record<string, unknown>, token: TokenLookup): StyleObject => {
	const out: StyleObject = {};
	const toSize = toLength(token, "fontSizes");
	const toLetter = toLength(token, "letterSpacings");

	if (typeof props.color === "string") out.color = token("colors", props.color);
	if (typeof props.font === "string") out.fontFamily = token("fonts", props.font);
	if (
		typeof props.weight === "string" ||
		(typeof props.weight === "number" && Number.isFinite(props.weight))
	) {
		out.fontWeight = String(token("fontWeights", props.weight as string | number));
	}
	if (props.size !== undefined) {
		out.fontSize = toSize(props.size as string | number);
	}
	if (typeof props.align === "string" && TEXT_ALIGN.has(props.align)) out.textAlign = props.align;
	if (typeof props.case === "string" && TEXT_CASE[props.case] !== undefined)
		out.textTransform = TEXT_CASE[props.case];
	if (props.truncate === true) {
		out.overflow = "hidden";
		out.textOverflow = "ellipsis";
		out.whiteSpace = "nowrap";
	}
	if (props.spacing !== undefined) {
		const spacing = props.spacing as
			| string
			| number
			| { line?: string | number; letter?: string | number };
		if (typeof spacing === "object" && spacing !== null && !Array.isArray(spacing)) {
			const line = spacing.line;
			const letter = spacing.letter;
			if (typeof line === "string" || (typeof line === "number" && Number.isFinite(line)))
				out.lineHeight = token("lineHeights", line);
			if (typeof letter === "string" || (typeof letter === "number" && Number.isFinite(letter))) {
				out.letterSpacing = toLetter(letter);
			}
		} else if (
			typeof spacing === "string" ||
			(typeof spacing === "number" && Number.isFinite(spacing))
		) {
			out.lineHeight = token("lineHeights", spacing);
		}
	}
	if (props.decoration !== undefined) {
		const decoration = props.decoration as
			| string
			| {
					type: string;
					style?: string;
					color?: string;
					thickness?: string | number;
					offset?: string | number;
			  };
		if (typeof decoration === "string") {
			if (DECORATION_LINES.has(decoration))
				out.textDecorationLine = decoration === "strikethrough" ? "line-through" : decoration;
		} else if (
			typeof decoration === "object" &&
			decoration !== null &&
			!Array.isArray(decoration)
		) {
			if (DECORATION_LINES.has(decoration.type))
				out.textDecorationLine =
					decoration.type === "strikethrough" ? "line-through" : decoration.type;
			if (decoration.style !== undefined && DECORATION_STYLES.has(decoration.style))
				out.textDecorationStyle = decoration.style;
			if (typeof decoration.color === "string") {
				out.textDecorationColor = token("colors", decoration.color);
			}
			if (decoration.thickness !== undefined) {
				if (
					typeof decoration.thickness === "string" ||
					(typeof decoration.thickness === "number" && Number.isFinite(decoration.thickness))
				)
					out.textDecorationThickness = normalizeCssValue(
						"textDecorationThickness",
						decoration.thickness,
					);
			}
			if (decoration.offset !== undefined) {
				if (
					typeof decoration.offset === "string" ||
					(typeof decoration.offset === "number" && Number.isFinite(decoration.offset))
				)
					out.textUnderlineOffset = normalizeCssValue("textUnderlineOffset", decoration.offset);
			}
		}
	}
	if (props.highlight !== undefined) {
		const highlight = props.highlight as string | { text?: string; bg?: string };
		if (typeof highlight === "string") {
			out.backgroundColor = token("colors", highlight);
		} else if (typeof highlight === "object" && highlight !== null && !Array.isArray(highlight)) {
			if (typeof highlight.text === "string") out.color = token("colors", highlight.text);
			if (typeof highlight.bg === "string") {
				out.backgroundColor = token("colors", highlight.bg);
			}
		}
	}

	return out;
};

export const textModule: DesignModuleAdapter = {
	key: "$text",
	resolve(props, { token }) {
		return resolveText(props, token);
	},
};
