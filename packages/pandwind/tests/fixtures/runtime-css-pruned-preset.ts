import { createCss } from "pandwind/css";
import { fixturePreset } from "./fixture-preset.ts";

const css = createCss(fixturePreset);

export const styles = css.class({ color: "red.500" });
