import { createDesignCss } from "../../src/design/index.ts";
import { fixturePreset } from "./fixture-preset.ts";

const css = createDesignCss(fixturePreset);

export const a = css.class({ $frame: { fill: "red.500" } });
export const b = css.vars({ $frame: { fill: "var(--runtime-color)" } });
