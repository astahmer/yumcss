import tailwindcss from "@tailwindcss/vite";
import { DevTools } from "@vitejs/devtools";
import react from "@vitejs/plugin-react-swc";
import { examplePreset } from "pandwind/preset";
import { pandwindDevtools } from "pandwind-devtools";
import { pandwindCssVite } from "pandwind/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [pandwindCssVite(examplePreset), tailwindcss(), react(), DevTools(), pandwindDevtools()],
});
