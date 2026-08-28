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

const resolveText = (props: Record<string, unknown>, token: TokenLookup): StyleObject => {
	const out: StyleObject = {};
	const toSize = toLength(token, "fontSizes");
	const toLetter = toLength(token, "letterSpacings");

	if (props.color !== undefined) out.color = token("colors", props.color as string);
	if (props.font !== undefined) out.fontFamily = token("fonts", props.font as string);
	if (props.weight !== undefined) {
		out.fontWeight = String(token("fontWeights", props.weight as string | number));
	}
	if (props.size !== undefined) {
		out.fontSize = toSize(props.size as string | number);
	}
	if (props.align !== undefined) out.textAlign = props.align as string;
	if (props.case !== undefined) out.textTransform = TEXT_CASE[props.case as string];
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
		if (typeof spacing === "object") {
			if (spacing.line !== undefined) out.lineHeight = token("lineHeights", spacing.line);
			if (spacing.letter !== undefined) {
				out.letterSpacing = toLetter(spacing.letter);
			}
		} else {
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
					thickness?: number | "auto";
					offset?: number | "auto";
			  };
		if (typeof decoration === "string") {
			out.textDecorationLine = decoration === "strikethrough" ? "line-through" : decoration;
		} else {
			out.textDecorationLine = decoration.type === "strikethrough" ? "line-through" : "underline";
			if (decoration.style !== undefined) out.textDecorationStyle = decoration.style;
			if (decoration.color !== undefined) {
				out.textDecorationColor = token("colors", decoration.color);
			}
			if (decoration.thickness !== undefined) {
				out.textDecorationThickness =
					decoration.thickness === "auto" ? "auto" : `${decoration.thickness}px`;
			}
			if (decoration.offset !== undefined) {
				out.textUnderlineOffset = decoration.offset === "auto" ? "auto" : `${decoration.offset}px`;
			}
		}
	}
	if (props.highlight !== undefined) {
		const highlight = props.highlight as string | { text?: string; bg?: string };
		if (typeof highlight === "string") {
			out.backgroundColor = token("colors", highlight);
		} else {
			if (highlight.text !== undefined) out.color = token("colors", highlight.text);
			if (highlight.bg !== undefined) {
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
