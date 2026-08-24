import { createDesignCss } from "pandwind/design";
import { examplePreset } from "pandwind/preset";
import { twAdapter } from "./bridge.ts";

/** The studio-grade css() bound to the example preset (tailwind adapter). */
export const css = createDesignCss(examplePreset, { className: twAdapter });
