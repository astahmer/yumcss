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

interface TailwindInstalledProofReport {
	readonly schema: string;
	readonly route: { readonly from: string; readonly to: string };
	readonly dependencies: { readonly installed: boolean; readonly targetNodeModule: boolean };
	readonly migration: {
		readonly converted: number;
		readonly skipped: number;
		readonly residuals: number;
		readonly targetUsesPandwind: boolean;
		readonly customThemeTokenPreserved: boolean;
		readonly sourceStylesheetImportRemoved: boolean;
		readonly generatedVitePresetImportIsExplicit: boolean;
	};
	readonly checks: {
		readonly sourceTypecheck: boolean;
		readonly targetTypecheck: boolean;
		readonly sourceBuild: boolean;
		readonly targetBuild: boolean;
		readonly sourceSsr: boolean;
		readonly targetSsr: boolean;
		readonly hydration: boolean;
	};
	readonly ssr: { readonly markupEquivalent: boolean };
	readonly browser: {
		readonly equivalent: boolean;
		readonly changedPixels: number;
		readonly hydrationErrors: readonly string[];
	};
	readonly css: { readonly sourceBytes: number; readonly targetBytes: number };
}

interface StyledComponentsInstalledProofReport {
	readonly schema: string;
	readonly route: { readonly from: string; readonly to: string };
	readonly dependencies: { readonly installed: boolean; readonly targetNodeModule: boolean };
	readonly migration: {
		readonly converted: number;
		readonly skipped: number;
		readonly residuals: number;
		readonly generatedSupportFiles: number;
		readonly targetUsesPandwind: boolean;
		readonly sourceImportRemoved: boolean;
		readonly generatedVitePresetImportIsExplicit: boolean;
		readonly generatedVitePluginPresent: boolean;
	};
	readonly checks: {
		readonly sourceTypecheck: boolean;
		readonly targetTypecheck: boolean;
		readonly sourceBuild: boolean;
		readonly targetBuild: boolean;
		readonly sourceSsr: boolean;
		readonly targetSsr: boolean;
		readonly hydration: boolean;
	};
	readonly ssr: { readonly markupEquivalent: boolean };
	readonly browser: {
		readonly equivalent: boolean;
		readonly changedPixels: number;
		readonly hydrationErrors: readonly string[];
	};
	readonly css: {
		readonly sourceBytes: number;
		readonly targetBytes: number;
		readonly targetNotLarger: boolean;
	};
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

	test("keeps the installed Tailwind project proof complete", () => {
		const report = JSON.parse(
			readFileSync(
				resolve(import.meta.dirname, "../../../plans/evidence/tailwind-installed-proof.json"),
				"utf8",
			),
		) as TailwindInstalledProofReport;
		expect(report).toMatchObject({
			schema: "pandwind.installed-project-proof/1",
			route: { from: "tailwind", to: "pandwind" },
			dependencies: { installed: true, targetNodeModule: true },
			migration: {
				converted: 1,
				skipped: 0,
				residuals: 0,
				targetUsesPandwind: true,
				customThemeTokenPreserved: true,
				sourceStylesheetImportRemoved: true,
				generatedVitePresetImportIsExplicit: true,
			},
			checks: {
				sourceTypecheck: true,
				targetTypecheck: true,
				sourceBuild: true,
				targetBuild: true,
				sourceSsr: true,
				targetSsr: true,
				hydration: true,
			},
			ssr: { markupEquivalent: true },
			browser: { equivalent: true, changedPixels: 0, hydrationErrors: [] },
		});
		expect(report.css.sourceBytes).toBeGreaterThan(0);
		expect(report.css.targetBytes).toBeGreaterThan(0);
	});

	test("keeps the installed styled-components project proof complete", () => {
		const report = JSON.parse(
			readFileSync(
				resolve(
					import.meta.dirname,
					"../../../plans/evidence/styled-components-installed-proof.json",
				),
				"utf8",
			),
		) as StyledComponentsInstalledProofReport;
		expect(report).toMatchObject({
			schema: "pandwind.installed-project-proof/1",
			route: { from: "styled-components", to: "pandwind" },
			dependencies: { installed: true, targetNodeModule: true },
			migration: {
				converted: 1,
				skipped: 0,
				residuals: 0,
				generatedSupportFiles: expect.any(Number),
				targetUsesPandwind: true,
				sourceImportRemoved: true,
				generatedVitePresetImportIsExplicit: true,
				generatedVitePluginPresent: true,
			},
			checks: {
				sourceTypecheck: true,
				targetTypecheck: true,
				sourceBuild: true,
				targetBuild: true,
				sourceSsr: true,
				targetSsr: true,
				hydration: true,
			},
			ssr: { markupEquivalent: true },
			browser: { equivalent: true, changedPixels: 0, hydrationErrors: [] },
			css: { targetNotLarger: true },
		});
		expect(report.css.sourceBytes).toBeGreaterThan(0);
		expect(report.css.targetBytes).toBeGreaterThan(0);
	});
});
