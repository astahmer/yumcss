import { createDesignCss } from "yumcss/design";
import { fixturePreset } from "./fixture-preset.ts";

const css = createDesignCss(fixturePreset);

export const styles = css.class({ $frame: { fill: "red.500" } });
