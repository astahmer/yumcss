import { createDesignCss } from "pandwind/design";
import { examplePreset } from "@pandwind/example-preset";

/**
 * The project's design CSS uses the Figma inspector vocabulary
 * ($frame / $layout / $text) against the example preset tokens. Literal
 * calls are extracted by `pandwindCssVite` into the app's atomic stylesheet.
 */
export const css = createDesignCss(examplePreset);
