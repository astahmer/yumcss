import { defineConfig } from "vitest/config";

/**
 * Keep generated adapter proof isolated from the repository-wide codemod suite.
 * The normal config intentionally discovers all package tests; this config is
 * the explicit fast path for directional and round-trip route work.
 */
export default defineConfig({
	test: {
		include: ["tests/routes/**/*.test.ts", "tests/roundtrips/**/*.test.ts"],
	},
});
