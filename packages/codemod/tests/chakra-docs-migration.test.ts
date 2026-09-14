import { describe, expect, test } from "vitest";
import {
	ChakraDocsLane,
	ChakraDocsMigration,
} from "../../../scripts/migration-proofs/migrate-chakra-docs.ts";
import { ensureReferenceWorkspace } from "../../../scripts/ensure-reference-workspace.ts";

const referenceAvailability = await ensureReferenceWorkspace("chakra-ui");
const referenceRoot = referenceAvailability.path;

describe("Chakra docs migration corpus", () => {
		test("converts supported Chakra styles from the pinned corpus", async () => {
			for (const lane of ChakraDocsMigration.lanes) {
				const report = await ChakraDocsMigration.run(lane, { referenceRoot });
			expect(report.referenceCommit).toMatch(/^[0-9a-f]{40}$/);
			expect(report.sourceFiles).toBeGreaterThan(80);
			expect(report.changedFiles).toBeGreaterThan(0);
			expect(report.changedFiles).toBeLessThanOrEqual(report.sourceFiles);
			expect(report.convertedCallSites).toBeGreaterThan(report.sourceFiles);
			expect(report.skippedCallSites).toBeGreaterThan(0);
			expect(report.residuals.length).toBeGreaterThanOrEqual(report.skippedCallSites);
			expect(report.residuals.length).toBeGreaterThan(0);
			expect(report.residuals).toEqual(
				report.residuals.map((residual) =>
					residual.kind === "composition"
						? expect.objectContaining({
								kind: "composition",
								text: "chakra factory styles",
								hint: expect.stringContaining("explicit composition lowering"),
						  })
						: residual.kind === "component"
							? expect.objectContaining({
									kind: "component",
									text: expect.any(String),
									hint: expect.stringContaining("no verified intrinsic projection"),
							  })
							: residual.kind === "unknown-utility"
								? expect.objectContaining({
										kind: "unknown-utility",
										text: expect.stringContaining("textStyle:"),
										hint: expect.stringContaining("not present in the Chakra theme"),
								  })
								: expect.objectContaining({
										kind: "dynamic",
										text: expect.stringContaining("--chakra-"),
										hint: expect.stringContaining("no owned source-token equivalent"),
								  }),
				),
			);
		}
	}, 120_000);

	test("lane identities are stable and exhaustive", () => {
		expect(ChakraDocsMigration.lanes).toEqual([ChakraDocsLane.CssClass, ChakraDocsLane.DesignCss]);
	});
});
