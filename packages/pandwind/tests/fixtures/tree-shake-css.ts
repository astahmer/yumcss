// Import from the ROOT barrel (`pandwind`) while using only the css() API —
// the bundler must drop tw()/cx()/preset, not ship them.
import { createCss } from "../../src/index.ts";

const css = createCss();

export const a = css.class({ color: "red", bg: "blue" });
export const b = css({ _hover: { color: "red" } });
