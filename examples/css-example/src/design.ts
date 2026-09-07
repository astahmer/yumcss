import { createDesignCss } from "pandwind/design";
import { examplePreset } from "@pandwind/example-preset";

/**
 * The project's design css: typed Figma-inspector vocabulary resolved
 * against examplePreset, emitted as atomic hashed classes (default
 * ClassNameStrategy). The preset MUST match the one handed to
 * `pandwindCssVite` in vite.config.ts so build-time extraction and runtime
 * hashes agree byte-for-byte.
 */
// Convention: design-lane instances are named `dcss` (distinct from engine
// css() instances).
export const dcss = createDesignCss(examplePreset);
