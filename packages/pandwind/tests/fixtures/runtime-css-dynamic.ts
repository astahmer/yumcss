import { createCss } from "../../src/css/index.ts";

const css = createCss();
const color = (globalThis as { location?: { hash?: string } }).location?.hash ?? "red";

export const card = css.class({ color });
