import { defineConfig } from "vite";

export default defineConfig({
	root: "compiler-preview-app",
	base: "./",
	build: {
		outDir: "../dist/compiler-preview-ui",
		emptyOutDir: true,
	},
});
