import { describe, expect, test } from "vitest";
import { StylexDocsMigration } from "../../../scripts/migrate-stylex-docs.ts";
import { StylexDocsLane } from "../../../scripts/migrate-stylex-docs.ts";
import { createReferenceWorkspace } from "../../../scripts/reference-workspace.ts";

const root = createReferenceWorkspace().path("stylex/packages/docs");

describe("StyleX docs migration lanes", () => {
	test("runtime-css lane emits the Pandwind group API", async () => {
		const report = await StylexDocsMigration.run(root, StylexDocsLane.RuntimeCss);
		expect(report.lane).toBe(StylexDocsLane.RuntimeCss);
		expect(report.invalidValidations).toBe(0);
	});

	test.each(StylexDocsMigration.lanes.map((lane) => lane.id))(
		"migrates the pinned corpus without unsafe residuals: %s",
		async (lane) => {
			const report = await StylexDocsMigration.run(root, lane);
			expect(report.sourceFiles).toBeGreaterThan(50);
			expect(report.changedFiles).toBeGreaterThan(50);
			expect(report.converted).toBeGreaterThanOrEqual(90);
			expect(report.skipped).toBe(0);
			expect(report.residuals).toBe(0);
			expect(report.invalidValidations).toBe(0);
		},
	);
});
