import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
	resolve: {
		alias: [
			{
				find: "pandwind/source/workspace",
				replacement: fileURLToPath(new URL("../pandwind/src/source-workspace.ts", import.meta.url)),
			},
			{
				find: "pandwind/source",
				replacement: fileURLToPath(new URL("../pandwind/src/source-scanner.ts", import.meta.url)),
			},
		],
	},
	test: {
		coverage: {
			provider: "v8",
			reporter: ["text", "json-summary", "html"],
			thresholds: {
				statements: 72,
				branches: 60,
				functions: 74,
				lines: 74,
			},
		},
	},
});
