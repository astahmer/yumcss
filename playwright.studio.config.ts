import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

const studioUrl = "http://127.0.0.1:5176";
const testDir = defineBddConfig({
	features: "apps/playground/e2e/studio/**/*.feature",
	steps: "apps/playground/e2e/studio/**/*.ts",
	outputDir: "apps/playground/e2e/.studio-features-gen",
	missingSteps: "fail-on-gen",
});

export default defineConfig({
	testDir,
	testMatch: /\.spec\.[jt]s$/u,
	timeout: 30_000,
	expect: { timeout: 5_000 },
	fullyParallel: true,
	use: {
		baseURL: `${studioUrl}/?token=studio-test`,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		...devices["Desktop Chrome"],
	},
	webServer: {
		command: "nub scripts/run-studio-e2e.mts",
		url: `${studioUrl}/?token=studio-test`,
		reuseExistingServer: false,
		timeout: 120_000,
	},
});
