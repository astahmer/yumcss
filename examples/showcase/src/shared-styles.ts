/**
 * THE write-once source (plans/021 showcase).
 *
 * These are plain design-vocabulary objects — `$frame`/`$text` modules with
 * preset token values and `_dark` conditions — TYPED against the preset so
 * token typos fail here, at the single place all three targets read from.
 * No engine, no target imports: each target lowers this module through its
 * own backend:
 *
 *   web    createDesignCss(examplePreset)        -> atomic classes + sheet
 *   native createDesignCss(examplePreset) [RN]  -> RN StyleSheet objects
 *   tui    createDesignCss(examplePreset) [OTUI] -> terminal style objects
 *
 * If you change a token here, all three targets change together.
 */
import type { DesignStyleObject } from "yumcss/design";
import type { examplePreset } from "@yumcss/example-preset";

type Styles = DesignStyleObject<typeof examplePreset>;

// NOTE: only the intersection of all three targets' vocabularies lives
// here (fills/corners/padding/colors). Typography is web/RN-only
// (terminals own fonts — yumcss/opentui refuses it loudly), which is
// exactly the per-backend vocabulary-subset story of plans/021.
export const header: Styles = {
	$frame: { fill: "$blue-500", corners: "lg", pad: [4, 8] },
	$text: { color: "$white" },
};

export const status: Styles = {
	$frame: { fill: "$gray-100" },
	_dark: { $frame: { fill: "$gray-900" } },
};

export const body: Styles = {
	$frame: { corners: "md", pad: "6px" },
	$text: { color: "$gray-700" },
};
