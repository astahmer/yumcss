import { createCss } from "../../src/css/index.ts";
import { fixturePreset } from "./fixture-preset.ts";

const css = createCss(fixturePreset);

export const a = css.class({ color: "red.500", padding: 4 });
export const b = css({ _hover: { color: "blue.500" } });
