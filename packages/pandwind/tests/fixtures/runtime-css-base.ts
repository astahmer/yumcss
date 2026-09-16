import { createCssRuntime } from "../../src/css/runtime-base.ts";

const css = createCssRuntime();

export const a = css({ color: "red", padding: "1rem" });
export const b = css({ _hover: { color: "blue" } });
