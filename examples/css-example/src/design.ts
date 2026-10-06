import { createDesignCss } from "yumcss/design";
import { examplePreset } from "@yumcss/example-preset";

/**
 * The project's design css: typed Figma-inspector vocabulary resolved
 * against examplePreset, emitted as atomic hashed classes (default
 * ClassNameStrategy). The preset MUST match the one handed to
 * `yumcssExtractVite` in vite.config.ts so build-time extraction and runtime
 * hashes agree byte-for-byte.
 */
// Convention: design-lane instances are named `dss` (distinct from engine
// css() instances).
export const dss = createDesignCss(examplePreset);
