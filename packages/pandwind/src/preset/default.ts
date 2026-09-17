import { define } from "../types/define-preset.export.ts";
import { presetConditions } from "./conditions.ts";
import { presetProperties, type PandwindProperties } from "./properties.ts";

const defaultCssConfig: PandwindProperties = {};

/**
 * Ready-to-use property and condition preset for standard Pandwind CSS.
 *
 * This is the built-in structural layer: its property definitions include
 * Pandwind's stock spacing, sizing, typography, border, radius, and related
 * scales. It ships no color palette, so a color property accepts a CSS-wide
 * keyword token or any authored CSS color value; import a palette preset such
 * as `pandwind/preset/tailwindcss` when the project should also resolve named
 * colors. Use {@link csstypePreset} when every value should be supplied by the
 * application instead.
 *
 * @example
 * ```ts
 * import { createCss } from "pandwind/css";
 * import { defaultPreset } from "pandwind/preset/default";
 *
 * const css = createCss(defaultPreset);
 * css.class({ display: "flex", padding: 4, color: "#e53e3e" });
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
