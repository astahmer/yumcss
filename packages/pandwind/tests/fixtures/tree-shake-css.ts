// css() lives ONLY on its subpath (`pandwind/css`) since the root export
// was curated down to tw+cx — importing here must not drag tw()/preset in.
import { createCss } from "../../src/css/index.ts";

const css = createCss();

export const a = css.class({ color: "red", background: "blue" });
export const b = css({ _hover: { color: "red" } });
