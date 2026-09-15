// css() lives ONLY on its subpath (`pandwind/css`) since the root export
// was curated down to tw+cx — importing here must not drag tw()/preset in.
import { createUnsafeCss } from "../../src/unsafe/css.ts";

const css = createUnsafeCss();

export const a = css.class({ color: "red", background: "blue" });
export const b = css({ _hover: { color: "red" } });
