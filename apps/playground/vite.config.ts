import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { examplePreset } from "pandwind/preset";
import { createPandwindEngineContext, pandwindCssVite, pandwindVite } from "pandwind/vite";
import { defineConfig } from "vite";
import { twAdapter } from "./src/bridge.ts";

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

// Same wiring as the example app: one shared engine context so the cx pass
// and the stylesheet agree, Tailwind compiles the shared utility sheet.
const engine = createPandwindEngineContext({ preset: examplePreset, className: twAdapter });

export default defineConfig({
	plugins: [
		pandwindVite({ css: { preset: examplePreset, engine } }),
		pandwindCssVite(examplePreset, { engine }),
		tailwindcss(),
		react(),
	],
	resolve: {
		alias: [
			{
				find: "@oxc-parser/binding-wasm32-wasi/wasi-worker-browser.mjs",
				replacement: join(wasiBindingDir, "wasi-worker-browser.mjs"),
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
