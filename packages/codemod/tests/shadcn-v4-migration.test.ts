import { describe, expect, test } from "vitest";
import {
	ShadcnV4Migration,
	ShadcnV4MigrationLane,
} from "../../../scripts/migration-proofs/migrate-shadcn-v4.ts";
import { ensureReferenceWorkspace } from "../../../scripts/ensure-reference-workspace.ts";

const referenceAvailability = await ensureReferenceWorkspace("shadcn-ui");
const referenceRoot = referenceAvailability.path;

describe("shadcn/ui v4 migration corpus", () => {
	test("runs every YumCSS API lane from the pinned corpus", async () => {
		for (const lane of ShadcnV4Migration.lanes) {
			const report = await ShadcnV4Migration.run(lane, { referenceRoot });
			expect(report.referenceCommit).toBe("683a5a9b370acdb7785a0529434e6a3b8c7e0441");
			expect(report.sourceFiles).toBe(246);
			expect(report.changedFiles).toBeGreaterThan(0);
			expect(report.convertedCallSites).toBeGreaterThan(0);
			expect(report.generatedUtilities).toBeGreaterThan(400);
			expect(report.generatedVariants).toBeGreaterThan(100);
			expect(report.generatedBridgeEntries).toBeGreaterThan(700);
			expect(report.residualCount).toBeGreaterThanOrEqual(0);
		}
	}, 120_000);

	test("lane identities are stable and exhaustive", () => {
		expect(ShadcnV4Migration.lanes).toEqual([
			ShadcnV4MigrationLane.Tw,
			ShadcnV4MigrationLane.Css,
			ShadcnV4MigrationLane.Dss,
		]);
	});
});
