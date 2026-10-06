import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

export default defineConfig({
	root: "client",
	base: "/__yumcss_devtools__/",
	plugins: [react()],
	build: {
		outDir: "../dist/client",
		emptyOutDir: false,
	},
});
