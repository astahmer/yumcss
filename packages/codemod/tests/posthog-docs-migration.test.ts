import { existsSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { PostHogDocsLane, PostHogDocsMigration } from "../../../scripts/migrate-posthog-docs.ts";

const referenceRoot = "/Users/astahmer/.references/posthog-com";

describe("PostHog website migration corpus", () => {
	const corpusTest = existsSync(referenceRoot) ? test : test.skip;

	corpusTest(
		"converts the static Tailwind surface without dropping residual utilities",
		async () => {
			const report = await PostHogDocsMigration.run(PostHogDocsLane.Tw, { referenceRoot });
			expect(report.referenceCommit).toBe("8a1619a0f2ec72d7d2d560d4fb5c9eca551b04ff");
			expect(report.sourceFiles).toBeGreaterThan(900);
			expect(report.changedFiles).toBeGreaterThan(900);
			expect(report.convertedCallSites).toBeGreaterThan(10_000);
			expect(report.mappedTokens).toBeGreaterThan(1_000);
			expect(report.residualCount).toBeGreaterThan(0);
			expect(report.outputByteDelta).toBeGreaterThan(0);
		},
		120_000,
	);

	test("lane identities are explicit", () => {
		expect(PostHogDocsMigration.lanes).toEqual([PostHogDocsLane.Tw]);
	});
});
