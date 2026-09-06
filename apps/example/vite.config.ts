import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { examplePreset } from "pandwind/preset";
import { pandwindCssVite } from "pandwind/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [pandwindCssVite(examplePreset), tailwindcss(), react()],
});
