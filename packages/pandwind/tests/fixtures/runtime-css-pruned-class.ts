import { createUnsafeCss } from "pandwind/unsafe/css";

const css = createUnsafeCss();
const color = (globalThis as { __pandwindRuntimeColor?: string }).__pandwindRuntimeColor ?? "red";

export const styles = css.class({ color });
