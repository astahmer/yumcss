import { defineConfig } from "vitest/config";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { tailwindDefaultCssPlugin } from "./tailwind-default-css-plugin.ts";

const codemodPackageDir = dirname(
	createRequire(import.meta.url).resolve("pandwind-codemod/package.json"),
);

export default defineConfig({
	plugins: [tailwindDefaultCssPlugin],
	test: {
		exclude: ["e2e/**", "node_modules/**", "dist/**"],
	},
	resolve: {
		conditions: ["pandwind"],
		alias: {
			// Mirror the vite alias: the package "pandwind" export condition is
			// not active under vitest, so resolve the scenario catalog to source.
			"pandwind-codemod/swap/official-api-cases": join(
				codemodPackageDir,
				"src/swap/official-api-cases.ts",
			),
			"pandwind-codemod/swap/browser": join(codemodPackageDir, "src/swap/browser.ts"),
		},
	},
});
