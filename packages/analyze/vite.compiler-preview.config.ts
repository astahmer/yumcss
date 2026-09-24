import { defineConfig } from "vite";

export default defineConfig({
	root: "compiler-preview-app",
	// The preview server scopes these relative asset URLs under its authorization token.
	base: "./",
	build: {
		outDir: "../dist/compiler-preview-ui",
		emptyOutDir: true,
	},
});
