import { createUnsafeCss } from "../../src/unsafe/css.ts";

const css = createUnsafeCss();

export const a = css.class({ color: "red", bg: "blue" });
export const b = css({ _hover: { color: "red" } });
