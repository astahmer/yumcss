import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

const migrationPreviewUrl = "http://127.0.0.1:5176";
const testDir = defineBddConfig({
	features: "apps/playground/e2e/migration-preview/**/*.feature",
	steps: "apps/playground/e2e/migration-preview/**/*.ts",
	outputDir: "apps/playground/e2e/.migration-preview-features-gen",
	missingSteps: "fail-on-gen",
});

export default defineConfig({
	testDir,
	testMatch: /\.spec\.[jt]s$/u,
	timeout: 30_000,
	expect: { timeout: 5_000 },
	fullyParallel: true,
	use: {
		baseURL: `${migrationPreviewUrl}/?token=migration-preview-test`,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		...devices["Desktop Chrome"],
	},
	webServer: {
		command: "nub scripts/run-migration-preview-e2e.mts",
		url: `${migrationPreviewUrl}/?token=migration-preview-test`,
		reuseExistingServer: false,
		timeout: 120_000,
	},
});
