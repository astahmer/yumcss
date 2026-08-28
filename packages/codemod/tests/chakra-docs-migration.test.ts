import { existsSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { ChakraDocsLane, ChakraDocsMigration } from "../../../scripts/migrate-chakra-docs.ts";

const referenceRoot = "/Users/astahmer/.references/chakra-ui";

describe("Chakra docs migration corpus", () => {
	const corpusTest = existsSync(referenceRoot) ? test : test.skip;

	corpusTest(
		"converts every supported Chakra lane without residuals",
		async () => {
			for (const lane of ChakraDocsMigration.lanes) {
				const report = await ChakraDocsMigration.run(lane, { referenceRoot });
				expect(report.referenceCommit).toMatch(/^[0-9a-f]{40}$/);
				expect(report.sourceFiles).toBeGreaterThan(80);
				expect(report.changedFiles).toBe(report.sourceFiles);
				expect(report.convertedCallSites).toBeGreaterThan(600);
				expect(report.skippedCallSites).toBe(0);
				expect(report.residuals).toEqual([]);
			}
		},
		30_000,
	);

	test("lane identities are stable and exhaustive", () => {
		expect(ChakraDocsMigration.lanes).toEqual([ChakraDocsLane.CssClass, ChakraDocsLane.DesignCss]);
	});
});
