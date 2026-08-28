import { describe, expect, test } from "vitest";
import { StylexDocsMigration } from "../../../scripts/migrate-stylex-docs.ts";

const root = new URL("../../../examples/stylex-docs-migration/source/", import.meta.url).pathname;

describe("StyleX docs migration lanes", () => {
	test.each(StylexDocsMigration.lanes.map((lane) => lane.id))(
		"migrates the pinned corpus without unsafe residuals: %s",
		async (lane) => {
			const report = await StylexDocsMigration.run(root, lane);
			expect(report.sourceFiles).toBeGreaterThan(50);
			expect(report.changedFiles).toBeGreaterThan(50);
			expect(report.converted).toBeGreaterThan(90);
			expect(report.skipped).toBe(0);
			expect(report.residuals).toBe(0);
			expect(report.invalidValidations).toBe(0);
		},
	);
});
