import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { examplePreset } from "pandwind/preset";
import { pandwindCssVite, pandwindVite } from "pandwind/vite";
import { defineConfig } from "vite";

export default defineConfig({
	// `enforce: "pre"` inlines literal `tw()` calls before Tailwind's scanner,
	// so statically-used classes are found naturally. Dynamic `tw()` calls
	// still work through the runtime and stay covered by the `tw:scan`
	// safelist.
	// `pandwindVite` inlines literal `tw()` calls before Tailwind's scanner;
	// `pandwindCssVite` extracts literal `css()` calls into a generated
	// stylesheet, served from the virtual `pandwind:css` module.
	plugins: [pandwindVite(), pandwindCssVite(examplePreset), tailwindcss(), react()],
});
