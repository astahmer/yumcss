import { createCss } from "../../src/css/index.ts";
import { createCx } from "../../src/cx/index.ts";

const css = createCss();
const cx = createCx({ css });

export const a = cx("flex", css.class({ color: "red" }), css({ bg: "blue" }));
