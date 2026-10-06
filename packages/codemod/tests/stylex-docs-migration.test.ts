import { describe, expect, test } from "vitest";
import { StylexDocsMigration } from "../../../scripts/migration-proofs/migrate-stylex-docs.ts";
import { StylexDocsLane } from "../../../scripts/migration-proofs/migrate-stylex-docs.ts";
import { ensureReferenceWorkspace } from "../../../scripts/ensure-reference-workspace.ts";

const stylexReference = await ensureReferenceWorkspace("stylex");
const root = `${stylexReference.path}/packages/docs`;

describe("StyleX docs migration lanes", () => {
	test("runtime-css lane emits the YumCSS group API", async () => {
		const report = await StylexDocsMigration.run(root, StylexDocsLane.RuntimeCss);
		expect(report.lane).toBe(StylexDocsLane.RuntimeCss);
		expect(report.invalidValidations).toBe(0);
	}, 30_000);

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
		30_000,
	);
});
