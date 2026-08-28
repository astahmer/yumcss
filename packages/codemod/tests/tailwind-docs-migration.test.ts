import { existsSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { TailwindDocsLane, TailwindDocsMigration } from "../../../scripts/migrate-tailwind-docs.ts";

const referenceRoot = "/Users/astahmer/.references/tailwindcss.com";

describe("Tailwind docs migration corpus", () => {
	const corpusTest = existsSync(referenceRoot) ? test : test.skip;
	corpusTest(
		"covers every supported Pandwind lane",
		async () => {
			for (const lane of TailwindDocsMigration.lanes) {
				const report = await TailwindDocsMigration.run(lane, { referenceRoot });
				expect(report.referenceCommit).toMatch(/^[0-9a-f]{40}$/);
				expect(report.sourceFiles).toBeGreaterThan(90);
				expect(report.changedFiles).toBeGreaterThan(30);
				expect(report.convertedCallSites).toBeGreaterThan(0);
				expect(report.generatedUtilities).toBeGreaterThan(400);
				expect(report.generatedVariants).toBeGreaterThan(80);
				expect(report.generatedBridgeEntries).toBeGreaterThan(4000);
				if (lane === TailwindDocsLane.Tw) {
					expect(
						report.residuals.some((residual) =>
							residual.reason.includes("Headless UI owns the production ref/Fragment contract"),
						),
					).toBe(true);
				}
			}
		},
		30_000,
	);

	test("lane identities are stable and exhaustive", () => {
		expect(TailwindDocsMigration.lanes).toEqual([
			TailwindDocsLane.Tw,
			TailwindDocsLane.CssClass,
			TailwindDocsLane.DesignDss,
		]);
	});
});
