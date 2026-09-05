import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Workspace packages expose their sources behind the "pandwind"
		// condition (see tsconfig.base.json customConditions). Without it,
		// Node-style resolution falls through to a stale dist/ build and
		// tests silently exercise yesterday's compiled behavior.
	},
	resolve: {
		conditions: ["pandwind"],
	},
	ssr: {
		resolve: {
			conditions: ["pandwind"],
		},
	},
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
});
