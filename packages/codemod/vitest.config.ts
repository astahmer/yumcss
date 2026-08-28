import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		coverage: {
			provider: "v8",
			reporter: ["text", "json-summary", "html"],
			thresholds: {
				statements: 75,
				branches: 63,
				functions: 85,
				lines: 79,
			},
		},
	},
});
