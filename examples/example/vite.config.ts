import tailwindcss from "@tailwindcss/vite";
import { DevTools } from "@vitejs/devtools";
import react from "@vitejs/plugin-react-swc";
import { pandwindDevtools } from "pandwind-devtools";
import { createPandwindEngineContext, pandwindCssVite, stackFoldVite } from "pandwind/vite";
import { defineConfig } from "vite";
import { examplePreset } from "@pandwind/example-preset";
import { css } from "./src/css.ts";

const engine = createPandwindEngineContext({ preset: examplePreset });

export default defineConfig({
	plugins: [
		// Static Stack props use the same configured CSS engine as the stylesheet
		// plugin, so the example proves responsive folding and generated rules.
		stackFoldVite({ engine }),
		// The dynamic-app example demonstrates both compiler carrier rewrites.
		pandwindCssVite(css, { engine, transformDynamicClassName: true }),
		tailwindcss(),
		react(),
		DevTools(),
		pandwindDevtools(),
	],
});
