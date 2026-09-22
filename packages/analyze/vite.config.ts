import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// The migration preview ships as one self-contained html artifact so the server stays a
// static file transport with no runtime asset resolution.
export default defineConfig({
	root: "migration-preview-app",
	build: {
		outDir: "../dist/migration-preview-ui",
		emptyOutDir: true,
	},
	plugins: [viteSingleFile()],
});
