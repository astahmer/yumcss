import { createDesignCss } from "pandwind/design";
import { pandwindCssVite, pandwindVite } from "pandwind/vite";
import { defineConfig } from "vite";
import { realWorldPreset } from "./real-world-theme.ts";

const css = createDesignCss(realWorldPreset);

export default defineConfig({
	plugins: [
		pandwindVite({ css: { preset: realWorldPreset } }),
		pandwindCssVite(css, { root: process.cwd() }),
	],
});
