import { createDesignCss } from "yumcss/design";
import { yumcssExtractVite, yumcssVite } from "yumcss/vite";
import { defineConfig } from "vite";
import { realWorldPreset } from "./real-world-theme.ts";

const css = createDesignCss(realWorldPreset);

export default defineConfig({
	plugins: [
		yumcssVite({ css: { preset: realWorldPreset } }),
		yumcssExtractVite(css, { root: process.cwd() }),
	],
});
