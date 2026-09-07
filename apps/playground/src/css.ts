import { createDesignCss } from "pandwind/design";
import { examplePreset } from "@pandwind/example-preset";
import { twAdapter } from "./bridge.ts";

/** Design-layer css() used by the sandbox (same preset as tw()). */
export const css = createDesignCss(examplePreset, { className: twAdapter });
