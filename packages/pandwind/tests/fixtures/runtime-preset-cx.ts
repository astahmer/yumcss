import { createCss } from "../../src/css/index.ts";
import { createCx } from "../../src/cx/index.ts";
import { legacyPreset } from "./legacy-preset.ts";

const css = createCss(legacyPreset);
const cx = createCx({ css });

export const a = cx("flex", css.class({ color: "red.500" }), css({ backgroundColor: "blue.500" }));
