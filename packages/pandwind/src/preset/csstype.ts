import type { StandardProperties } from "csstype";
import { define } from "../types/define-preset.export.ts";
import { presetConditions } from "./conditions.ts";

const csstypeCssConfig: StandardProperties = {};

/**
 * Structural property declaration for the tokenless Pandwind `csstype` preset.
 *
 * `$all` exposes the properties from the `csstype` config without attaching
 * any stock token maps. Use this when the application owns its token catalog
 * or needs ordinary CSS values without Pandwind's opinionated scales.
 *
 * @category presets
 * @since 0.1.0
 */
export const csstypeProperties = define.properties({ $all: true });

/** The inferred structural property declaration of {@link csstypeProperties}. */
export type CsstypeProperties = typeof csstypeProperties;

/**
 * Tokenless structural preset for applications that provide their own values.
 *
 * @example
 * ```ts
 * import { createCss } from "pandwind/css";
 * import { csstypePreset } from "pandwind/preset/csstype";
 *
 * const css = createCss(csstypePreset);
 * css.class({ display: "flex", padding: "1rem" });
 * ```
 *
 * @category presets
 * @since 0.1.0
 */
export const csstypePreset = define.preset(
	{ config: csstypeCssConfig, tokens: {} },
	{
		strict: true,
		conditions: presetConditions,
		properties: csstypeProperties,
	},
);

/** The inferred type of {@link csstypePreset}. */
export type CsstypePreset = typeof csstypePreset;
