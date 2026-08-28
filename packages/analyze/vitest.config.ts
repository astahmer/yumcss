import { defineConfig } from "vitest/config";

export default defineConfig({
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
