import { defineConfig } from "vite";

export default defineConfig({
	build: {
		lib: {
			entry: "client/main.ts",
			formats: ["es"],
			fileName: () => "client/main.js",
		},
		outDir: "dist",
		emptyOutDir: false,
	},
});
