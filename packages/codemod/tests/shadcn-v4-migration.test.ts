import { existsSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { ShadcnV4Migration, ShadcnV4MigrationLane } from "../../../scripts/migrate-shadcn-v4.ts";
import { createReferenceWorkspace } from "../../../scripts/reference-workspace.ts";

const referenceRoot = createReferenceWorkspace().path("shadcn-ui");

describe("shadcn/ui v4 migration corpus", () => {
	const corpusTest = existsSync(referenceRoot) ? test : test.skip;

	corpusTest(
		"runs every Pandwind API lane against the pinned authored corpus",
		async () => {
			for (const lane of ShadcnV4Migration.lanes) {
				const report = await ShadcnV4Migration.run(lane, { referenceRoot });
				expect(report.referenceCommit).toBe("683a5a9b370acdb7785a0529434e6a3b8c7e0441");
				expect(report.sourceFiles).toBe(235);
				expect(report.changedFiles).toBeGreaterThan(0);
				expect(report.convertedCallSites).toBeGreaterThan(0);
				expect(report.generatedUtilities).toBeGreaterThan(400);
				expect(report.generatedVariants).toBeGreaterThan(100);
				expect(report.generatedBridgeEntries).toBeGreaterThan(700);
				expect(report.residualCount).toBeGreaterThanOrEqual(0);
			}
		},
		60_000,
	);

	test("lane identities are stable and exhaustive", () => {
		expect(ShadcnV4Migration.lanes).toEqual([
			ShadcnV4MigrationLane.Tw,
			ShadcnV4MigrationLane.Css,
			ShadcnV4MigrationLane.Dcss,
		]);
	});
});
