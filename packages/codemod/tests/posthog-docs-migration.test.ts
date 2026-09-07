import { describe, expect, test } from "vitest";
import { PostHogDocsLane, PostHogDocsMigration } from "../../../scripts/migrate-posthog-docs.ts";
import { ensureReferenceWorkspace } from "../../../scripts/ensure-reference-workspace.ts";

const referenceAvailability = await ensureReferenceWorkspace("posthog-com");
const referenceRoot = referenceAvailability.path;

describe("PostHog website migration corpus", () => {
	test("converts the static Tailwind surface from the pinned corpus", async () => {
		const report = await PostHogDocsMigration.run(PostHogDocsLane.Tw, { referenceRoot });
		expect(report.referenceCommit).toBe("8a1619a0f2ec72d7d2d560d4fb5c9eca551b04ff");
		expect(report.sourceFiles).toBeGreaterThan(900);
		expect(report.changedFiles).toBeGreaterThan(900);
		expect(report.convertedCallSites).toBeGreaterThan(10_000);
		expect(report.mappedTokens).toBeGreaterThan(1_000);
		expect(report.residualCount).toBeGreaterThan(0);
		expect(report.outputByteDelta).toBeGreaterThan(0);
	}, 120_000);

	test("converts bridge-complete call sites when the corpus is available", async () => {
		const report = await PostHogDocsMigration.run(PostHogDocsLane.CssClass, {
			referenceRoot,
		});
		expect(report.referenceCommit).toBe("8a1619a0f2ec72d7d2d560d4fb5c9eca551b04ff");
		expect(report.changedFiles).toBeGreaterThan(300);
		expect(report.convertedCallSites).toBeGreaterThan(300);
		expect(report.residualCount).toBeGreaterThan(0);
	}, 120_000);

	test("routes the same declarations when the corpus is available", async () => {
		const report = await PostHogDocsMigration.run(PostHogDocsLane.DesignCss, {
			referenceRoot,
		});
		expect(report.referenceCommit).toBe("8a1619a0f2ec72d7d2d560d4fb5c9eca551b04ff");
		expect(report.changedFiles).toBeGreaterThan(300);
		expect(report.convertedCallSites).toBeGreaterThan(300);
		expect(report.residualCount).toBeGreaterThan(0);
	}, 120_000);

	test("lane identities are explicit", () => {
		expect(PostHogDocsMigration.lanes).toEqual([
			PostHogDocsLane.Tw,
			PostHogDocsLane.CssClass,
			PostHogDocsLane.DesignCss,
		]);
	});
});
