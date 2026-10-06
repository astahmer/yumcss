import { createUnsafeCss } from "../../src/unsafe/css.ts";

const css = createUnsafeCss();
const color = (globalThis as { location?: { hash?: string } }).location?.hash ?? "red";

export const card = css.class({ color });
