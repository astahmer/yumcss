import { createUnsafeCss } from "../../src/unsafe/css.ts";
import { createCx } from "../../src/cx/index.ts";
import { createTw } from "../../src/tw/index.ts";

const css = createUnsafeCss();
const tw = createTw<Record<string, unknown>>({});
const cx = createCx({ css });

export const a = cx(tw({ bg: "red-500", p: "4" }), css.class({ color: "red" }), "flex");
