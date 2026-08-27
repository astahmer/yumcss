import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { REAL_REPOSITORY_CORPUS } from "../src/swap/index.ts";

describe("pinned real repository corpus", () => {
	test("keeps source provenance and residual evidence for three repositories", () => {
		const report = JSON.parse(
			readFileSync(
				resolve(import.meta.dirname, "../../../plans/evidence/real-repository-migrations.json"),
				"utf8",
			),
		) as { schema: string; reports: Array<{ id: string; commit: string; path: string }> };
		expect(report.schema).toBe("pandwind.real-repository-report/1");
		expect(report.reports).toHaveLength(3);
		for (const fixture of REAL_REPOSITORY_CORPUS) {
			expect(report.reports).toContainEqual(
				expect.objectContaining({ id: fixture.id, commit: fixture.commit, path: fixture.path }),
			);
		}
		expect(report.reports.some((item) => item.id === "panda-website-home")).toBe(true);
	});
});
