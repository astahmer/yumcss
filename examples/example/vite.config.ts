import tailwindcss from "@tailwindcss/vite";
import { DevTools } from "@vitejs/devtools";
import react from "@vitejs/plugin-react-swc";
import { yumcssDevtools } from "@yumcss/devtools";
import { createYumCSSEngineContext, yumcssExtractVite, stackFoldVite } from "yumcss/vite";
import { defineConfig } from "vite";
import { examplePreset } from "@yumcss/example-preset";
import { css } from "./src/css.ts";

const engine = createYumCSSEngineContext({ preset: examplePreset });

export default defineConfig({
	plugins: [
		// Static Stack props use the same configured CSS engine as the stylesheet
		// plugin, so the example proves responsive folding and generated rules.
		stackFoldVite({ engine }),
		// The dynamic-app example demonstrates both compiler carrier rewrites.
		yumcssExtractVite(css, { engine, transformDynamicClassName: true }),
		tailwindcss(),
		react(),
		DevTools(),
		yumcssDevtools(),
	],
});
