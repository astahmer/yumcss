import { describe, expect, test } from "vitest";
import { TailwindDocsLane, TailwindDocsMigration } from "../../../scripts/migrate-tailwind-docs.ts";
import {
	createReferenceWorkspace,
	inspectReferenceAvailability,
	REFERENCE_AVAILABILITY,
} from "../../../scripts/reference-workspace.ts";

const referenceAvailability = inspectReferenceAvailability(
	createReferenceWorkspace(),
	"tailwindcss.com",
);
const referenceRoot = referenceAvailability.path;

describe("Tailwind docs migration corpus", () => {
	test("covers every supported Pandwind lane or reports the unavailable corpus", async () => {
		if (referenceAvailability.status === REFERENCE_AVAILABILITY.Unavailable) {
			expect(referenceAvailability).toEqual({
				id: "tailwindcss.com",
				path: referenceRoot,
				status: "unavailable",
				prepareCommand: "nub run references:prepare",
			});
			return;
		}
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
	}, 120_000);

	test("lane identities are stable and exhaustive", () => {
		expect(TailwindDocsMigration.lanes).toEqual([
			TailwindDocsLane.Tw,
			TailwindDocsLane.CssClass,
			TailwindDocsLane.DesignDss,
		]);
	});
});
