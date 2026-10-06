import { createUnsafeCss } from "../../src/unsafe/css.ts";

const css = createUnsafeCss();

export const card = css.class({ color: "red", padding: "4px" });
export const panel = css({ _hover: { color: "blue" } });
