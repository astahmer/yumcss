import { define } from "../types/define-preset.export.ts";
import { presetConditions } from "./conditions.ts";
import { presetProperties, type YumCSSProperties } from "./properties.ts";

const defaultCssConfig: YumCSSProperties = {};

/**
 * Ready-to-use property and condition preset for standard YumCSS CSS.
 *
 * This is the built-in structural layer: its property definitions include
 * YumCSS's stock spacing, sizing, typography, border, radius, and related
 * scales. It ships no color palette, so a color property accepts a CSS-wide
 * keyword token or any authored CSS color value; import a palette preset such
 * as `yumcss/preset/tailwindcss` when the project should also resolve named
 * colors. Use {@link csstypePreset} when every value should be supplied by the
 * application instead.
 *
 * @example
 * ```ts
 * import { createCss } from "yumcss/css";
 * import { defaultPreset } from "yumcss/preset/default";
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
