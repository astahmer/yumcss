import { createCss } from "../../src/css/index.ts";

const css = createCss();

export const card = css.class({ color: "red", padding: "4px" });
export const panel = css({ _hover: { color: "blue" } });
