import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { examplePreset } from "pandwind/preset";
import { createPandwindEngineContext, pandwindCssVite, pandwindVite } from "pandwind/vite";
import { defineConfig } from "vite";
import { twAdapter } from "./src/bridge.ts";

// Same wiring as the example app: one shared engine context so the cx pass
// and the stylesheet agree, Tailwind compiles the shared utility sheet.
const engine = createPandwindEngineContext({ preset: examplePreset, className: twAdapter });

export default defineConfig({
	plugins: [
		pandwindVite({ css: { preset: examplePreset, engine } }),
		pandwindCssVite(examplePreset, { engine }),
		tailwindcss(),
		react(),
	],
});
