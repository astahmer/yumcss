import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

interface InstalledProofReport {
	readonly schema: string;
	readonly adapter: string;
	readonly migration: {
		readonly skipped: number;
		readonly residuals: number;
		readonly targetCodeContainsPandwind: boolean;
	};
	readonly ssr: { readonly markupEquivalent: boolean; readonly notLarger: boolean };
	readonly browser: { readonly equivalent: boolean; readonly errors: readonly string[] };
}

describe("installed adapter proof artifacts", () => {
	test("keeps the promoted Goober report lossless and browser-equivalent", () => {
		const report = JSON.parse(
			readFileSync(
				resolve(import.meta.dirname, "../../../plans/evidence/goober-installed-proof.json"),
				"utf8",
			),
		) as InstalledProofReport;
		expect(report.schema).toBe("pandwind.installed-adapter-proof/1");
		expect(report.adapter).toBe("goober");
		expect(report.migration).toMatchObject({
			skipped: 0,
			residuals: 0,
			targetCodeContainsPandwind: true,
		});
		expect(report.ssr).toMatchObject({ markupEquivalent: true, notLarger: true });
		expect(report.browser).toMatchObject({ equivalent: true, errors: [] });
	});
});
