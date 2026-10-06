import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

interface InstalledCanonicalProof {
	readonly checked: boolean;
	readonly equal: boolean;
	readonly sourceBytes: number;
	readonly targetBytes: number;
	readonly differences: readonly string[];
}

interface InstalledProofReport {
	readonly schema: string;
	readonly adapter: string;
	readonly migration: {
		readonly skipped: number;
		readonly residuals: number;
		readonly targetCodeContainsYumCSS: boolean;
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
		readonly canonical: InstalledCanonicalProof;
		readonly targetUsesYumCSS: boolean;
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
		readonly canonical: InstalledCanonicalProof;
		readonly generatedSupportFiles: number;
		readonly targetUsesYumCSS: boolean;
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

interface PandaInstalledProofReport {
	readonly schema: string;
	readonly route: { readonly from: string; readonly to: string };
	readonly dependencies: { readonly installed: boolean; readonly targetNodeModule: boolean };
	readonly migration: {
		readonly converted: number;
		readonly skipped: number;
		readonly residuals: number;
		readonly canonical: InstalledCanonicalProof;
		readonly targetUsesYumCSS: boolean;
		readonly customTokenPreserved: boolean;
		readonly sourceStylesheetImportRemoved: boolean;
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

interface UnoCssInstalledProofReport extends PandaInstalledProofReport {
	readonly route: { readonly from: string; readonly to: string };
}

describe("installed adapter proof artifacts", () => {
	test("keeps the promoted Goober report lossless and browser-equivalent", () => {
		const report = JSON.parse(
			readFileSync(
				resolve(import.meta.dirname, "../../../plans/evidence/goober-installed-proof.json"),
				"utf8",
			),
		) as InstalledProofReport;
		expect(report.schema).toBe("yumcss.installed-adapter-proof/1");
		expect(report.adapter).toBe("goober");
		expect(report.migration).toMatchObject({
			skipped: 0,
			residuals: 0,
			targetCodeContainsYumCSS: true,
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
			schema: "yumcss.installed-project-proof/1",
			route: { from: "tailwind", to: "yumcss" },
			dependencies: { installed: true, targetNodeModule: true },
			migration: {
				converted: 2,
				skipped: 0,
				residuals: 0,
				canonical: { checked: true, equal: true, differences: [] },
				targetUsesYumCSS: true,
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
			schema: "yumcss.installed-project-proof/1",
			route: { from: "styled-components", to: "yumcss" },
			dependencies: { installed: true, targetNodeModule: true },
			migration: {
				converted: 1,
				skipped: 0,
				residuals: 0,
				canonical: { checked: true, equal: true, differences: [] },
				generatedSupportFiles: expect.any(Number),
				targetUsesYumCSS: true,
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

	test("keeps the installed Panda project proof complete", () => {
		const report = JSON.parse(
			readFileSync(
				resolve(import.meta.dirname, "../../../plans/evidence/panda-installed-proof.json"),
				"utf8",
			),
		) as PandaInstalledProofReport;
		expect(report).toMatchObject({
			schema: "yumcss.installed-project-proof/1",
			route: { from: "panda", to: "yumcss" },
			dependencies: { installed: true, targetNodeModule: true },
			migration: {
				converted: 1,
				skipped: 0,
				residuals: 0,
				canonical: { checked: true, equal: true, differences: [] },
				targetUsesYumCSS: true,
				customTokenPreserved: true,
				sourceStylesheetImportRemoved: true,
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

	test("keeps the installed UnoCSS project proof complete", () => {
		const report = JSON.parse(
			readFileSync(
				resolve(import.meta.dirname, "../../../plans/evidence/unocss-installed-proof.json"),
				"utf8",
			),
		) as UnoCssInstalledProofReport;
		expect(report).toMatchObject({
			schema: "yumcss.installed-project-proof/1",
			route: { from: "unocss", to: "yumcss" },
			dependencies: { installed: true, targetNodeModule: true },
			migration: {
				converted: 1,
				skipped: 0,
				residuals: 0,
				canonical: { checked: true, equal: true, differences: [] },
				targetUsesYumCSS: true,
				customTokenPreserved: true,
				sourceStylesheetImportRemoved: true,
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
