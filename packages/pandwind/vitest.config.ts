import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Several suites compile real Tailwind stylesheets (@tailwindcss/node);
		// on cold caches that legitimately exceeds vitest's 5s default.
		testTimeout: 30_000,
		hookTimeout: 30_000,
	},
});
