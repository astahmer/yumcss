// Build-time only: the stylesheet generator must never ship to the browser.
// Kept as a size baseline — importing it from the css barrel used to drag
// postcss-selector-parser into the runtime bundle.
import { createStylesheet } from "../../src/css/create-stylesheet.ts";

export const x = createStylesheet;
