// Root barrel for cx(); the css engine it binds comes via its own subpath
// (root no longer carries css) — tw()/preset must be shaken out either way.
import { createCx } from "../../src/index.ts";
import { createUnsafeCss } from "../../src/unsafe/css.ts";

const css = createUnsafeCss();
const cx = createCx({ css });

export const a = cx("flex", css.class({ color: "red" }), css({ bg: "blue" }));
