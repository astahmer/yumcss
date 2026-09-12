import { createCss } from "../../src/css/index.ts";
import { cssShorthands } from "../../src/css/shorthands.ts";

const css = createCss({ propertyAliases: cssShorthands });

export const a = css.class({ color: "red", bg: "blue" });
export const b = css({ _hover: { color: "red" } });
