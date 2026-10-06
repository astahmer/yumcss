import { createCss } from "../../src/css/index.ts";
import { tailwindPreset } from "../../src/preset/tailwindcss.ts";

const css = createCss(tailwindPreset);

export const a = css.class({ color: "$slate-700", padding: 4 });
export const b = css({ _hover: { color: "$slate-950" } });
