import { describe, expect, test } from "vitest";
import {
	StyledComponentsDocsLane,
	StyledComponentsDocsMigration,
} from "../../../scripts/migrate-styled-components-docs.ts";

const referenceRoot = "/Users/astahmer/.references/styled-components-website";

describe("styled-components docs migration lanes", () => {
	test.each(StyledComponentsDocsMigration.lanes)(
		"migrates the pinned corpus without residuals: %s",
		async (lane) => {
			const report = await StyledComponentsDocsMigration.run(lane, { referenceRoot });

			expect(report.lane).toBe(lane);
			expect(report.referenceCommit).toMatch(/^[0-9a-f]{40}$/);
			expect(report.sourceFiles).toBe(54);
			expect(report.changedFiles).toBe(54);
			expect(report.convertedCallSites).toBe(285);
			expect(report.staticCallSites).toBe(82);
			expect(report.runtimeFallbackCallSites).toBe(44);
			expect(report.dynamicValueCallSites).toBe(203);
			expect(report.staticCssCoverageRatio).toBeCloseTo((285 - 44) / 285);
			expect(report.staticExtractionRatio).toBeCloseTo(82 / 285);
			expect(report.skippedCallSites).toBe(0);
			expect(report.residuals).toEqual([]);
		},
		30_000,
	);

	test("keeps the two lane identities distinct", () => {
		expect(StyledComponentsDocsLane.RuntimeCss).not.toBe(StyledComponentsDocsLane.DesignCss);
	});
});
