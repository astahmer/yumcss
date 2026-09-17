import { createCss } from "../../src/css/index.ts";
import { pandaPreset } from "../../src/preset/panda.ts";

const css = createCss(pandaPreset);

export const a = css.class({ backgroundColor: "gray.100", color: "red.500", padding: 4 });
export const b = css({ _hover: { color: "gray.100" } });
