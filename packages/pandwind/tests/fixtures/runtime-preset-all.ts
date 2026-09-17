import { createCss } from "../../src/css/index.ts";
import { createCx } from "../../src/cx/index.ts";
import { createTw } from "../../src/tw/index.ts";
import { legacyPreset } from "./legacy-preset.ts";

const css = createCss(legacyPreset);
const tw = createTw<Record<string, unknown>>({});
const cx = createCx({ css });

export const a = cx(tw({ bg: "red-500", p: "4" }), css.class({ color: "red.500" }), "flex");
