/**
 * Preset builders and the built-in Pandwind token/property catalog.
 *
 * Application code normally imports `definePreset`, `defineTokens`, and
 * `pandwindPreset` from this subpath so the chosen design-system boundary is
 * visible in the module graph.
 *
 * @category presets
 * @since 0.1.0
 */
export * from "../types/define-preset.ts";
/**
 * Modern standard CSS property and value types for bring-your-own CSS
 * configuration contracts.
 *
 * Import the type from `pandwind/preset` for the common web case. Import
 * specialized `csstype` variants directly when a project needs them.
 */
export type { StandardProperties } from "csstype";
export * from "./colors.ts";
export * from "./conditions.ts";
export * from "./preset.ts";
export * from "./properties.ts";
export * from "./tokens.ts";
