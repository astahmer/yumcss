import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// The studio ships as one self-contained html artifact so the server stays a
// static file transport with no runtime asset resolution.
export default defineConfig({
	root: "studio-app",
	build: {
		outDir: "../dist/studio-ui",
		emptyOutDir: true,
	},
	plugins: [viteSingleFile()],
});
