import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import react from "@vitejs/plugin-react-swc";
import { examplePreset } from "pandwind/preset";
import { pandwindCssVite } from "pandwind/vite";
import { defineConfig } from "vite";

/** Cross-origin isolation: required by oxc-parser's SharedArrayBuffer workers. */
const ISOLATION_HEADERS = {
	"Cross-Origin-Opener-Policy": "same-origin",
	"Cross-Origin-Embedder-Policy": "require-corp",
};

// oxc-parser's wasm binding references its pthread worker with a BARE
// specifier inside `new Worker(new URL(...))`; vite's dep optimizer resolves
// that relative to the package dir (doubled path -> 404) in dev. Alias it to
// the real file so both dev and build emit a correct worker URL.
const wasiBindingDir = dirname(
	createRequire(import.meta.url).resolve("@oxc-parser/binding-wasm32-wasi/package.json"),
);

export default defineConfig({
	plugins: [
		pandwindCssVite(examplePreset, {
			cssSources: ["css", "design", "ui-css"],
		}),
		react(),
	],
	resolve: {
		alias: [
			{
				find: "@oxc-parser/binding-wasm32-wasi/wasi-worker-browser.mjs",
				replacement: join(wasiBindingDir, "wasi-worker-browser.mjs"),
			},
			{
				// Workspace source of the shared official-api scenario catalog.
				// Vitest and the dev server cannot use the package "pandwind"
				// export condition, and dist may be stale; alias to source so
				// tests and the lab always exercise the current catalog.
				find: "pandwind-codemod/swap/official-api-cases",
				replacement: join(
					dirname(createRequire(import.meta.url).resolve("pandwind-codemod/package.json")),
					"src/swap/official-api-cases.ts",
				),
			},
			{
				// Same stale-dist risk as the scenario catalog: the browser-safe
				// swap surface must stay current with new exports in dev.
				find: "pandwind-codemod/swap/browser",
				replacement: join(
					dirname(createRequire(import.meta.url).resolve("pandwind-codemod/package.json")),
					"src/swap/browser.ts",
				),
			},
		],
	},
	// Keep oxc-parser out of esbuild prebundling: the optimizer mangles the
	// binding's bare-specifier worker URL (doubled package path -> 404).
	optimizeDeps: {
		exclude: ["oxc-parser", "@oxc-parser/binding-wasm32-wasi"],
	},
	// oxc-parser's wasm binding boots pthread workers that transfer a
	// SharedArrayBuffer — browsers only allow that on cross-origin-isolated
	// pages (COOP/COEP). Needed identically in dev and preview/prod.
	server: {
		headers: ISOLATION_HEADERS,
	},
	preview: {
		headers: ISOLATION_HEADERS,
	},
});
