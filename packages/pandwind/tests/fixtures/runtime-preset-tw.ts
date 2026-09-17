import { createCss } from "../../src/css/index.ts";
import { defaultPreset } from "../../src/preset/default.ts";
import { createTw } from "../../src/tw/index.ts";

const css = createCss(defaultPreset);
const tw = createTw<Record<string, unknown>>({});

export const a = tw({ bg: ["red-500", "blue-500"] });
export const b = css.class({ color: "red.500", padding: 4 });
