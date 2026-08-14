import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { pandwindVite } from "pandwind/vite";
import { defineConfig } from "vite";

export default defineConfig({
	// `enforce: "pre"` inlines literal `tw()` calls before Tailwind's scanner,
	// so statically-used classes are found naturally. Dynamic `tw()` calls
	// still work through the runtime and stay covered by the `tw:scan`
	// safelist.
	plugins: [pandwindVite(), tailwindcss(), react()],
});
