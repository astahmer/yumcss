import { createCss } from "../../src/css/index.ts";
import { createTw } from "../../src/tw/index.ts";
import { legacyPreset } from "./legacy-preset.ts";

const css = createCss(legacyPreset);
const tw = createTw<Record<string, unknown>>({});

export const a = tw({ bg: ["red-500", "blue-500"] });
export const b = css.class({ color: "red.500", padding: 4 });
