import react from "@vitejs/plugin-react-swc";
import { examplePreset } from "@yumcss/example-preset";
import { createYumCSSEngineContext, yumcssExtractVite, yumcssVite } from "yumcss/vite";
import { defineConfig } from "vite";

const engine = createYumCSSEngineContext({ preset: examplePreset });

// Pure CSS-backend consumer: yumcssExtractVite scans literal css()/design-css()
// calls and serves the deduped atomic stylesheet from the virtual
// `yumcss:css` module (imported in main.tsx). No Tailwind, no tw adapter —
// this app proves the atomic-hashed-class path end to end.
export default defineConfig({
	plugins: [
		yumcssVite({ css: { preset: examplePreset, engine } }),
		yumcssExtractVite(examplePreset, { engine }),
		react(),
	],
});
