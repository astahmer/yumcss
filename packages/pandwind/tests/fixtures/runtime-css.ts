import { createCss } from "../../src/css/index.ts";

const css = createCss();

export const a = css.class({ color: "red", bg: "blue" });
export const b = css({ _hover: { color: "red" } });
