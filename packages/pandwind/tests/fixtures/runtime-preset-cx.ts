import { createCss } from "../../src/css/index.ts";
import { createCx } from "../../src/cx/index.ts";
import { defaultPreset } from "../../src/preset/default.ts";

const css = createCss(defaultPreset);
const cx = createCx({ css });

export const a = cx("flex", css.class({ color: "#e53e3e" }), css({ backgroundColor: "#3182ce" }));
