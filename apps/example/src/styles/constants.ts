import { css } from "../design";

/** Shared design atoms used by the cross-module composition demo. */
export const CARD_BASE = css.class({
	$frame: {
		w: "28rem",
		corners: "xl",
		border: { color: "$gray-200", width: 1 },
		pad: 24,
	},
	$raw: { marginInline: "auto", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" },
});

export const MUTED_TEXT = css.class({
	$text: { size: "sm", spacing: { line: "24px" }, color: "$gray-600" },
	_dark: { $text: { color: "$gray-300" } },
});
