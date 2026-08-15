import { createDesignCss } from "pandwind/design";
import { examplePreset } from "pandwind/preset";
import { twAdapter } from "./bridge";

/**
 * The project's design css: typed with the Figma-inspector vocabulary
 * ($frame / $layout / $text) against the example preset tokens. The same
 * preset is passed to `pandwindCssVite` in vite.config.ts. With the
 * tailwind adapter, css() emits the same utilities tw() emits
 * (`$blue-500` -> `text-blue-500`), so Tailwind compiles the CSS once for
 * both APIs; literal calls are inlined by the plugin and Tailwind's scanner
 * finds them (no atomic stylesheet is generated in this mode).
 */
export const css = createDesignCss(examplePreset, { className: twAdapter });

/* probe */

/* probe */
