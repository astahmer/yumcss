import { createDesignCss } from "yumcss/design";
import { examplePreset } from "@yumcss/example-preset";

/**
 * The project's design CSS uses the Figma inspector vocabulary
 * ($frame / $layout / $text) against the example preset tokens. Literal
 * calls are extracted by `yumcssExtractVite` into the app's atomic stylesheet.
 */
export const dss = createDesignCss(examplePreset);
