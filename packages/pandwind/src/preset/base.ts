import type { StandardProperties } from "csstype";
import { define } from "../types/define-preset.ts";
import { presetConditions } from "./conditions.ts";

const baseCssConfig: StandardProperties = {};

/**
 * Structural property declaration for the tokenless Pandwind base preset.
 *
 * `$all` exposes the properties from the `csstype` config without attaching
 * any stock token maps. Use this when the application owns its token catalog
 * or needs ordinary CSS values without Pandwind's opinionated scales.
 *
 * @category presets
 * @since 0.1.0
 */
export const baseProperties = define.properties({ $all: true });

/** The inferred structural property declaration of {@link baseProperties}. */
export type BaseProperties = typeof baseProperties;

/**
 * Tokenless structural preset for applications that provide their own values.
 *
 * @example
 * ```ts
 * import { createCss } from "pandwind/css";
 * import { basePreset } from "pandwind/preset/base";
 *
 * const css = createCss(basePreset);
 * css.class({ display: "flex", padding: "1rem" });
 * ```
 *
 * @category presets
 * @since 0.1.0
 */
export const basePreset = define.preset(
	{ config: baseCssConfig, tokens: {} },
	{
		strict: true,
		conditions: presetConditions,
		properties: baseProperties,
	},
);

/** The inferred type of {@link basePreset}. */
export type BasePreset = typeof basePreset;
