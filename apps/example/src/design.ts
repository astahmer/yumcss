import { createDesignCss } from "pandwind/design";
import { examplePreset } from "pandwind/preset";

/**
 * The project's design css: typed with the Figma-inspector vocabulary
 * ($frame / $layout / $text) against the example preset tokens. The same
 * preset is passed to `pandwindCssVite` in vite.config.ts, so static calls
 * are extracted into the generated stylesheet at build time.
 */
export const css = createDesignCss(examplePreset);
