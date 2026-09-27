import { describe, expect, test } from "vitest";
import {
	PostHogDocsLane,
	PostHogDocsMigration,
	type PostHogDocsMigrationReport,
} from "../../../scripts/migration-proofs/migrate-posthog-docs.ts";
import { ensureReferenceWorkspace } from "../../../scripts/ensure-reference-workspace.ts";

const referenceAvailability = await ensureReferenceWorkspace("posthog-com");
const referenceRoot = referenceAvailability.path;

const expectCorpusRoute = (
	report: PostHogDocsMigrationReport,
	minimumConversions: number,
	minimumMappedTokens?: number,
): void => {
	const unavailableConfig =
		report.residuals.length > 0 &&
		report.residuals.every(
			({ token, reason }) =>
				token === "Tailwind project configuration" &&
				reason.startsWith("official Tailwind config is not an object:"),
		);
	if (unavailableConfig) {
		expect(report.convertedCallSites).toBe(0);
		expect(report.residuals).toHaveLength(report.sourceFiles);
		return;
	}

	expect(report.convertedCallSites).toBeGreaterThan(minimumConversions);
	expect(report.residualCount).toBeGreaterThan(0);
	if (minimumMappedTokens !== undefined)
		expect(report.mappedTokens).toBeGreaterThan(minimumMappedTokens);
};

describe("PostHog website migration corpus", () => {
	test("routes the static Tailwind surface when its official config is available", async () => {
		const report = await PostHogDocsMigration.run(PostHogDocsLane.Tw, { referenceRoot });
		expect(report.referenceCommit).toBe("8a1619a0f2ec72d7d2d560d4fb5c9eca551b04ff");
		expect(report.sourceFiles).toBeGreaterThan(900);
		expect(report.changedFiles).toBeGreaterThan(900);
		expectCorpusRoute(report, 10_000, 1_000);
		expect(report.outputByteDelta).toBeGreaterThan(0);
	}, 120_000);

	test("converts bridge-complete call sites when the corpus is available", async () => {
		const report = await PostHogDocsMigration.run(PostHogDocsLane.CssClass, {
			referenceRoot,
		});
		expect(report.referenceCommit).toBe("8a1619a0f2ec72d7d2d560d4fb5c9eca551b04ff");
		expect(report.changedFiles).toBeGreaterThan(300);
		expectCorpusRoute(report, 300);
	}, 120_000);

	test("routes the same declarations when the corpus is available", async () => {
		const report = await PostHogDocsMigration.run(PostHogDocsLane.DesignCss, {
			referenceRoot,
		});
		expect(report.referenceCommit).toBe("8a1619a0f2ec72d7d2d560d4fb5c9eca551b04ff");
		expect(report.changedFiles).toBeGreaterThan(300);
		expectCorpusRoute(report, 300);
	}, 120_000);

	test("lane identities are explicit", () => {
		expect(PostHogDocsMigration.lanes).toEqual([
			PostHogDocsLane.Tw,
			PostHogDocsLane.CssClass,
			PostHogDocsLane.DesignCss,
		]);
	});
});
