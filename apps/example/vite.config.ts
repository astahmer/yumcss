import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { examplePreset } from "pandwind/preset";
import { createPandwindEngineContext, pandwindCssVite, pandwindVite } from "pandwind/vite";
import { defineConfig } from "vite";
import { twAdapter } from "./src/bridge.ts";

// One shared engine context: the cx pass compiles literal css() atoms with
// the same registry the stylesheet plugin uses, so folded classes and rules
// always agree.
const engine = createPandwindEngineContext({ preset: examplePreset, className: twAdapter });

export default defineConfig({
	// `enforce: "pre"` inlines literal `tw()` calls before Tailwind's scanner,
	// so statically-used classes are found naturally. Dynamic `tw()` calls
	// still work through the runtime and stay covered by the `tw:scan`
	// safelist.
	// `pandwindVite` inlines literal `tw()` calls before Tailwind's scanner;
	// `pandwindCssVite` extracts literal `css()` calls into a generated
	// stylesheet, served from the virtual `pandwind:css` module.
	plugins: [
		pandwindVite({ css: { preset: examplePreset, engine } }),
		// Tailwind mode: css() calls are inlined to the same utilities tw()
		// emits, so Tailwind's scanner compiles one shared stylesheet.
		pandwindCssVite(examplePreset, { engine }),
		tailwindcss(),
		react(),
	],
});
