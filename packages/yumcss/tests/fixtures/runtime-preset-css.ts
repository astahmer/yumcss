import { createCss } from "../../src/css/index.ts";
import { defaultPreset } from "../../src/preset/default.ts";

const css = createCss(defaultPreset);

export const a = css.class({ $raw: { color: "#e53e3e" }, padding: 4 });
export const b = css({ _hover: { $raw: { color: "#3182ce" } } });
