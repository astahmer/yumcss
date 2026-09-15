import { define } from "../types/define-preset.ts";
import { presetConditions } from "./conditions.ts";
import { presetProperties, type PandwindProperties } from "./properties.ts";

const standardCssConfig: PandwindProperties = {};

/**
 * Built-in property and condition preset for standard Pandwind CSS.
 *
 * Use this for the library's default CSS vocabulary. Define a smaller preset
 * with {@link define.preset} when an application wants a constrained contract.
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
export const pandwindPreset = define.preset(
	{
		config: standardCssConfig,
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
