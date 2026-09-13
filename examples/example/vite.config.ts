import tailwindcss from "@tailwindcss/vite";
import { DevTools } from "@vitejs/devtools";
import react from "@vitejs/plugin-react-swc";
import { pandwindDevtools } from "pandwind-devtools";
import { pandwindCssVite } from "pandwind/vite";
import { defineConfig } from "vite";
import { css } from "./src/css.ts";

export default defineConfig({
	plugins: [
		// The dynamic-app example demonstrates both compiler carrier rewrites.
		pandwindCssVite(css, { transformDynamicClassName: true }),
		tailwindcss(),
		react(),
		DevTools(),
		pandwindDevtools(),
	],
});
