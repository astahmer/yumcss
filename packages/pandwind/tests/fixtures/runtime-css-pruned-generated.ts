import { createGeneratedCss } from "pandwind/css/generated";
import { fixturePreset } from "./fixture-preset.ts";

const css = createGeneratedCss(fixturePreset);

export const styles = css.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
