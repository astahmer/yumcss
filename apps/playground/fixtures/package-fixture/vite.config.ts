import { resolve } from "node:path";
import react from "@vitejs/plugin-react-swc";
import { pandwindCssVite } from "pandwind/vite";
import { defineConfig } from "vite";
import { css } from "./src/css";

const root = import.meta.dirname;
const outDir = process.env.PANDWIND_FIXTURE_OUT_DIR ?? resolve(root, "dist");

export default defineConfig({
	root,
	plugins: [pandwindCssVite(css, { root, virtualId: "pandwind:css" }), react()],
	resolve: { conditions: ["pandwind"] },
	build: { outDir, emptyOutDir: true },
});
