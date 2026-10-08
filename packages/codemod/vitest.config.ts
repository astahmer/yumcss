import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Tailwind's official compiler is exercised by the bridge and parity
		// suites; a cold compiler load legitimately exceeds Vitest's default.
		testTimeout: 90_000,
		hookTimeout: 90_000,
		// The generated route corpus contains nearly two thousand files. Reusing
		// a small worker pool keeps cold official-loader work below the per-test
		// timeout and avoids spawning one isolated worker per file.
		isolate: false,
		maxWorkers: process.env.CI ? 1 : 4,
		// Workspace packages expose their sources behind the "yumcss"
		// condition (see tsconfig.base.json customConditions). Without it,
		// Node-style resolution falls through to a stale dist/ build and
		// tests silently exercise yesterday's compiled behavior.
	},
	resolve: {
		conditions: ["yumcss"],
	},
	ssr: {
		resolve: {
			conditions: ["yumcss"],
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
