import { createUnsafeCss } from "../../src/unsafe/css.ts";
import { createCx } from "../../src/cx/index.ts";

const css = createUnsafeCss();
const cx = createCx({ css });

export const a = cx("flex", css.class({ color: "red" }), css({ bg: "blue" }));
