import { resolve } from "node:path";
import react from "@vitejs/plugin-react-swc";
import { yumcssExtractVite } from "yumcss/vite";
import { defineConfig } from "vite";
import { css } from "./src/css";

const root = import.meta.dirname;
const outDir = process.env.YUMCSS_FIXTURE_OUT_DIR ?? resolve(root, "dist");

export default defineConfig({
	root,
	plugins: [yumcssExtractVite(css, { root, virtualId: "yumcss:css" }), react()],
	resolve: { conditions: ["yumcss"] },
	build: { outDir, emptyOutDir: true },
});
