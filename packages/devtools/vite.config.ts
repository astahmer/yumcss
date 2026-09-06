import { defineConfig } from "vite";

export default defineConfig({
	root: "client",
	base: "/__pandwind_devtools__/",
	build: {
		outDir: "../dist/client",
		emptyOutDir: false,
	},
});
