import { createCss } from "../../src/css/index.ts";
import { chakraPreset } from "../../src/preset/chakra.ts";

const css = createCss(chakraPreset);

export const a = css.class({ color: "$gray.700", $raw: { padding: 4 } });
export const b = css({ _hover: { color: "$gray.950" } });
