import react from "@vitejs/plugin-react-swc";
import { examplePreset } from "@pandwind/example-preset";
import { createPandwindEngineContext, pandwindCssVite, pandwindVite } from "pandwind/vite";
import { defineConfig } from "vite";
import { css } from "./src/css.ts";

const engine = createPandwindEngineContext({ preset: examplePreset });

// Pure CSS-backend consumer: pandwindCssVite scans literal css()/design-css()
// calls and serves the deduped atomic stylesheet from the virtual
// `pandwind:css` module (imported in main.tsx). No Tailwind, no tw adapter —
// this app proves the atomic-hashed-class path end to end.
export default defineConfig({
	plugins: [
		pandwindVite({ css: { preset: examplePreset, engine } }),
		pandwindCssVite(css, { engine }),
		react(),
	],
});
