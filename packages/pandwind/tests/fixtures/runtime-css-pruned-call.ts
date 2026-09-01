import { createCss } from "pandwind/css";

const css = createCss();
const color = (globalThis as { __pandwindRuntimeColor?: string }).__pandwindRuntimeColor ?? "red";

export const styles = css({ color });
