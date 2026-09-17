import { createCss } from "../../src/css/index.ts";
import { createCx } from "../../src/cx/index.ts";
import { defaultPreset } from "../../src/preset/default.ts";
import { createTw } from "../../src/tw/index.ts";

const css = createCss(defaultPreset);
const tw = createTw<Record<string, unknown>>({});
const cx = createCx({ css });

export const a = cx(tw({ bg: "red-500", p: "4" }), css.class({ color: "#e53e3e" }), "flex");
