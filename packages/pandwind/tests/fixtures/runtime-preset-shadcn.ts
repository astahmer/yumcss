import { createCss } from "../../src/css/index.ts";
import { shadcnPreset } from "../../src/preset/shadcn.ts";

const css = createCss(shadcnPreset);

export const a = css.class({ backgroundColor: "$background", color: "$foreground", padding: 4 });
export const b = css({ _hover: { color: "$primary" } });
