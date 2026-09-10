import type { Properties } from "csstype";
import { createCss } from "pandwind/css";
import { definePreset, defineTheme } from "pandwind/preset";

const playgroundPreset = definePreset(defineTheme({ config: {} as Properties, tokens: {} }), {
	strict: true,
	conditions: {},
	properties: { $all: true },
});

/** Atomic styles owned by the playground application chrome. */
export const css = createCss(playgroundPreset);
