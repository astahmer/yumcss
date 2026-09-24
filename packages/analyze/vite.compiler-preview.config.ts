import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
	root: "compiler-preview-app",
	build: {
		outDir: "../dist/compiler-preview-ui",
		emptyOutDir: true,
	},
	plugins: [viteSingleFile()],
});
