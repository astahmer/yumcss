import { define } from "../types/define-preset.export.ts";
import { presetConditions } from "./conditions.ts";
import { presetProperties, type PandwindProperties } from "./properties.ts";

const defaultCssConfig: PandwindProperties = {};

/**
 * Ready-to-use property and condition preset for standard Pandwind CSS.
 *
 * This is the opinionated built-in layer: its property definitions include
 * Pandwind's stock colors, spacing, sizing, typography, border, radius, and
 * related scales. Use {@link csstypePreset} when those values should be supplied
 * by the application instead.
 *
 * @example
 * ```ts
 * import { createCss } from "pandwind/css";
 * import { defaultPreset } from "pandwind/preset/default";
 *
 * const css = createCss(defaultPreset);
 * css.class({ display: "flex", padding: 4 });
 * ```
 *
 * @category presets
 * @since 0.1.0
 */
export const defaultPreset = define.preset(
	{ config: defaultCssConfig, tokens: {} },
	{
		strict: true,
		conditions: presetConditions,
		properties: presetProperties,
	},
);

/** The inferred type of {@link defaultPreset}. */
export type DefaultPreset = typeof defaultPreset;
