import type { StandardProperties } from "csstype";
import { definePreset } from "../types/define-preset.ts";
import { presetConditions } from "./conditions.ts";
import { presetProperties } from "./properties.ts";

/**
 * The built-in property and condition preset for the standard Pandwind CSS
 * vocabulary.
 *
 * Use this when you want the library's default CSS properties and conditions
 * without authoring an application-specific token theme. For a strict design
 * system, define a smaller preset with {@link definePreset} instead.
 *
 * @example
 * ```ts
 * import { createCss } from "pandwind/css";
 * import { pandwindPreset } from "pandwind/preset";
 *
 * const css = createCss(pandwindPreset);
 * css.class({ display: "flex", padding: "4" });
 * ```
 *
 * @category presets
 * @since 0.1.0
 */
export const pandwindPreset = definePreset(
	{
		config: {} as StandardProperties,
		tokens: {},
	},
	{
		strict: true,
		conditions: presetConditions,
		properties: presetProperties,
	},
);

/** The inferred type of {@link pandwindPreset}. */
export type PandwindPreset = typeof pandwindPreset;
