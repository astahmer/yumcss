import { createCss } from "../../src/css/index.ts";
import { defaultPreset } from "../../src/preset/default.ts";

const css = createCss(defaultPreset);

export const a = css.class({ color: "red.500", padding: 4 });
export const b = css({ _hover: { color: "blue.500" } });
