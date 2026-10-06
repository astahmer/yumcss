import { createUnsafeCss } from "yumcss/unsafe/css";

const css = createUnsafeCss();
const color = (globalThis as { __yumcssRuntimeColor?: string }).__yumcssRuntimeColor ?? "red";

export const styles = css({ color });
