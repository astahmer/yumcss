// Generated from the workspace-linked pandwind package. Do not edit.
import type { ClassNameStrategy } from "../css/class-name-strategy.d.ts";
import type { CssConfigReturn } from "../types/typings.d.ts";
import type { UtilityBridge } from "./bridge.d.ts";
import type { TwVariantsMeta } from "./compile.d.ts";
export interface TwAdapterOptions {
    /** Variant metadata from the generated `tw.ts` (join separators). */
    variants: TwVariantsMeta;
    /** Generated `(property, resolved value) -> utility` map. */
    bridge: UtilityBridge;
    /**
     * Optional preset: enables token resolution (`$blue-500` -> `#3182ce`)
     * and arbitrary-variant fallbacks for preset conditions.
     */
    preset?: CssConfigReturn;
}
/**
 * Build the engine's pluggable class strategy. Pass the result as
 * `createCss(preset, { className })` / `createDesignCss(preset, { className })`.
 */
export declare function createTwAdapter(options: TwAdapterOptions): ClassNameStrategy;
