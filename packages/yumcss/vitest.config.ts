import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Several suites compile real Tailwind stylesheets (@tailwindcss/node);
		// on cold caches that legitimately exceeds vitest's 5s default.
		testTimeout: 30_000,
		hookTimeout: 30_000,
		coverage: {
			provider: "v8",
			reporter: ["text", "json-summary", "html"],
			thresholds: {
				statements: 85,
				branches: 72,
				functions: 84,
				lines: 88,
			},
		},
	},
});
