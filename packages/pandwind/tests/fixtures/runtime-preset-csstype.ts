import { createCss } from "../../src/css/index.ts";
import { csstypePreset } from "../../src/preset/csstype.ts";

const css = createCss(csstypePreset);

export const a = css.class({ color: "red", padding: "1rem" });
export const b = css({ _hover: { color: "blue" } });
