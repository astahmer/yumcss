import { ALL_RUNTIME_METHODS } from "../css/runtime-methods.ts";
import { createDesignCssRuntime } from "./runtime.ts";
import type { CreateCssOptions } from "../css/runtime-base.ts";
import type { CssFn } from "../css/create-css.ts";
import type { DesignDynamicStyleObject, DesignPreset, DesignStyleObject } from "./types.ts";

/**
 * Create a preset-aware CSS function with `$frame`, `$layout`, and `$text` modules.
 *
 * The projections match `createCss`, but the style object is organized by
 * intent: `$frame` describes the box, `$layout` its children, and `$text`
 * typography. Raw CSS stays explicit under `$raw`.
 *
 * @example
 * ```ts
 * import { createDesignCss } from "yumcss/design";
 * import { examplePreset } from "@yumcss/example-preset";
 *
 * const dss = createDesignCss(examplePreset);
 *
 * const cardClass = dss.class({
 *   $frame: { corners: "lg", fill: "$blue-500", pad: [8, 16] },
 * });
 * const card = dss(
 *   { $frame: { corners: "lg", fill: "$blue-500", pad: [8, 16] } },
 *   {
 *     $layout: { flow: "stackX", align: "center", gap: 8 },
 *     $text: { color: "$gray-50", weight: "semibold" },
 *     _hover: { $frame: { fill: "$blue-600" } },
 *   },
 * );
 * const props = dss.props(card);
 * ```
 *
 * @typeParam TPreset - Design-compatible preset carrying tokens and conditions.
 * @param preset - The preset that defines the design token vocabulary.
 * @param options - CSS backend options such as a class-name strategy or
 *   dynamic-carrier namespace.
 * @returns A preset-aware {@link CssFn} over {@link DesignStyleObject} values.
 * @see {@link createCss} for ordinary CSS property objects.
 * @category factories
 * @since 0.1.0
 */
export const createDesignCss = <TPreset extends DesignPreset>(
	preset: TPreset,
	options: CreateCssOptions = {},
): CssFn<
	DesignStyleObject<TPreset>,
	DesignDynamicStyleObject<TPreset>,
	DesignStyleObject<TPreset>
> => {
	// SAFETY: ALL_RUNTIME_METHODS installs every CssFn projection before this escapes.
	return createDesignCssRuntime(preset, options, ALL_RUNTIME_METHODS) as unknown as CssFn<
		DesignStyleObject<TPreset>,
		DesignDynamicStyleObject<TPreset>,
		DesignStyleObject<TPreset>
	>;
};

export type { DesignDynamicStyleObject, DesignPreset, DesignStyleObject } from "./types.ts";
