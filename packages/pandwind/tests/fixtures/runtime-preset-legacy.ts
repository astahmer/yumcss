import { createCss } from "../../src/css/index.ts";
import { legacyPreset } from "./legacy-preset.ts";

const css = createCss(legacyPreset);

export const a = css.class({ color: "red.500", padding: 4 });
export const b = css({ _hover: { color: "blue.500" } });
