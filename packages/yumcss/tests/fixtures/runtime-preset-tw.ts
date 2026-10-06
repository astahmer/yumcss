import { createCss } from "../../src/css/index.ts";
import { createTw } from "../../src/tw/index.ts";
import { fixturePreset } from "./fixture-preset.ts";

const css = createCss(fixturePreset);
const tw = createTw<Record<string, unknown>>({});

export const a = tw({ bg: ["red-500", "blue-500"] });
export const b = css.class({ color: "red.500", padding: 4 });
