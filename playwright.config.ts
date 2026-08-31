import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

const playgroundPort = process.env.PLAYWRIGHT_PORT ?? "4175";
const playgroundUrl = `http://127.0.0.1:${playgroundPort}`;

const testDir = defineBddConfig({
	features: "apps/playground/e2e/features/**/*.feature",
	steps: "apps/playground/e2e/steps/**/*.ts",
	outputDir: "apps/playground/e2e/.features-gen",
	missingSteps: "fail-on-gen",
});

export default defineConfig({
	testDir,
	testMatch: /\.spec\.[jt]s$/u,
	timeout: 30_000,
	expect: { timeout: 5_000 },
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? "github" : "list",
	use: {
		baseURL: playgroundUrl,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
		...devices["Desktop Chrome"],
	},
	webServer: {
		command: `pnpm --filter playground dev --host 127.0.0.1 --port ${playgroundPort}`,
		url: `${playgroundUrl}/migrate`,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
