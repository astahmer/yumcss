// Root barrel, cx() + the css atoms it needs — tw()/preset must be shaken out.
import { createCss, createCx } from "../../src/index.ts";

const css = createCss();
const cx = createCx({ css });

export const a = cx("flex", css.class({ color: "red" }), css({ bg: "blue" }));
