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

// Base styles use the vocabulary shared by web, React Native, and OpenTUI.
// Corner radii stay in separate web/native extensions because OpenTUI refuses
// CSS borderRadius instead of approximating it with terminal cells.
export const header: Styles = {
	$frame: { fill: "$blue-500", pad: [4, 8] },
	$text: { color: "$white" },
};

export const headerCorners: Styles = { $frame: { corners: "lg" } };

export const statusBase: Styles = {
	$frame: { fill: "$gray-100" },
};

export const status: Styles = {
	...statusBase,
	_dark: { $frame: { fill: "$gray-900" } },
};

export const body: Styles = {
	$frame: { pad: "6px" },
	$text: { color: "$gray-700" },
};

export const bodyCorners: Styles = { $frame: { corners: "md" } };
