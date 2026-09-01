import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { CodemodAdapterId, createBuiltinCodemodCatalog } from "../src/swap/index.ts";
import { adapterContractFixtures } from "../proof/adapter-contract-fixtures.ts";
import { completeAdapterMatrixFixtures } from "../proof/adapter-matrix-fixtures.ts";

const repoRoot = resolve(import.meta.dirname, "../../..");
const codemodRoot = resolve(import.meta.dirname, "..");
const catalog = createBuiltinCodemodCatalog();
const pandwindSource =
	'import { createCss } from "pandwind/css";\n' +
	"const css = createCss();\n" +
	'export const card = css.class({ color: "red", padding: "1rem" });\n';
const pandwindFixture = adapterContractFixtures.find(
	(fixture) => fixture.adapter === CodemodAdapterId.Pandwind,
);
const cliE2e =
	process.env.CI === "true" && process.env.PANDWIND_CLI_MATRIX_E2E === "1"
		? describe
		: describe.skip;

function runCli(
	directory: string,
	from: string,
	to: string,
	sourceOverride?: string,
	fileOverride?: string,
): {
	readonly report: {
		readonly files: readonly [
			{ readonly converted: number; readonly skipped: number; readonly residuals: number },
		];
	};
	readonly source: string;
} {
	const fixture = adapterContractFixtures.find((candidate) => candidate.adapter === from);
	const file = join(
		directory,
		`${from.replaceAll("/", "-")}-${to.replaceAll("/", "-")}-${fileOverride ?? fixture?.file ?? "source.tsx"}`,
	);
	writeFileSync(file, sourceOverride ?? fixture?.source ?? pandwindSource);
	const output = execFileSync(
		"pnpm",
		[
			"exec",
			"tsx",
			"src/cli.ts",
			"swap",
			`--from=${from}`,
			`--to=${to}`,
			"--safe",
			"--write",
			"--report=json",
			file,
		],
		{ cwd: codemodRoot, encoding: "utf8" },
	);
	return {
		report: JSON.parse(output) as {
			files: readonly [{ converted: number; skipped: number; residuals: number }];
		},
		source: readFileSync(file, "utf8"),
	};
}

cliE2e("CLI adapter migration e2e matrix", () => {
	test("writes a host-dialect conversion to the target extension", () => {
		const directory = mkdtempSync(join(repoRoot, ".tmp-codemod-e2e-"));
		const file = join(directory, "App.vue");
		const source =
			"<script setup>\n" +
			'import styled from "vue-styled-components";\n' +
			'const Card = styled.div({ color: "red" });\n' +
			"</script>\n<template><Card /></template>";
		writeFileSync(file, source);
		try {
			const output = execFileSync(
				"pnpm",
				[
					"exec",
					"tsx",
					"src/cli.ts",
					"swap",
					`--from=${CodemodAdapterId.VueStyled}`,
					`--to=${CodemodAdapterId.Stitches}`,
					"--safe",
					"--write",
					"--report=json",
					file,
				],
				{ cwd: codemodRoot, encoding: "utf8" },
			);
			const report = JSON.parse(output) as {
				readonly files: readonly [{ readonly file: string; readonly outputFile?: string }];
			};
			const outputFile = report.files[0]?.outputFile;
			expect(outputFile).toMatch(/App\.tsx$/u);
			expect(existsSync(file)).toBe(false);
			expect(outputFile === undefined ? false : existsSync(resolve(repoRoot, outputFile))).toBe(
				true,
			);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	}, 120_000);

	test.each(catalog.adapters.map((adapter) => adapter.id))(
		"executes the %s -> Pandwind command with safe source preservation",
		(sourceAdapter) => {
			const directory = mkdtempSync(join(repoRoot, ".tmp-codemod-e2e-"));
			try {
				const { report, source } = runCli(directory, sourceAdapter, CodemodAdapterId.Pandwind);
				const result = report.files[0]!;
				if (sourceAdapter === CodemodAdapterId.Pandwind) {
					expect(result.converted).toBe(0);
					expect(result.skipped).toBe(0);
					expect(source).toBe(pandwindFixture?.source ?? pandwindSource);
					return;
				}
				expect(result.converted + result.skipped).toBeGreaterThan(0);
				if (result.skipped > 0) {
					expect(result.residuals).toBeGreaterThan(0);
					expect(source).toContain("pandwind:migrate-skip");
				} else {
					expect(source).not.toContain("adapter capability mismatch");
				}
			} finally {
				rmSync(directory, { recursive: true, force: true });
			}
		},
		120_000,
	);

	test.each(catalog.adapters.map((adapter) => adapter.id))(
		"executes the Pandwind -> %s command with explicit outcome evidence",
		(targetAdapter) => {
			const directory = mkdtempSync(join(repoRoot, ".tmp-codemod-e2e-"));
			try {
				const { report, source } = runCli(directory, CodemodAdapterId.Pandwind, targetAdapter);
				const result = report.files[0]!;
				if (targetAdapter === CodemodAdapterId.Pandwind) {
					expect(result.converted).toBe(0);
					expect(result.skipped).toBe(0);
					expect(source).toBe(pandwindFixture?.source ?? pandwindSource);
					return;
				}
				expect(result.converted + result.skipped).toBeGreaterThan(0);
				if (result.skipped > 0) {
					expect(result.residuals).toBeGreaterThan(0);
					expect(source).toContain("pandwind:migrate-skip");
				} else {
					expect(source).not.toContain("adapter capability mismatch");
				}
			} finally {
				rmSync(directory, { recursive: true, force: true });
			}
		},
		120_000,
	);

	test.each(catalog.adapters.map((adapter) => adapter.id))(
		"keeps the %s edge case explicit through the real CLI",
		(sourceAdapter) => {
			const fixture = completeAdapterMatrixFixtures.find(
				(candidate) => candidate.sourceAdapter === sourceAdapter && candidate.scenario === "edge",
			);
			if (fixture === undefined) throw new Error(`missing edge fixture for ${sourceAdapter}`);
			const directory = mkdtempSync(join(repoRoot, ".tmp-codemod-e2e-"));
			try {
				const { report, source } = runCli(
					directory,
					sourceAdapter,
					CodemodAdapterId.Pandwind,
					fixture.source,
					fixture.file,
				);
				const result = report.files[0]!;
				if (sourceAdapter === CodemodAdapterId.Pandwind) {
					expect(result.converted).toBe(0);
					expect(result.skipped).toBe(0);
					expect(source).toBe(fixture.source);
					return;
				}
				expect(result.converted + result.skipped).toBeGreaterThan(0);
				if (result.skipped > 0) {
					expect(result.residuals).toBeGreaterThan(0);
					expect(source).toContain("pandwind:migrate-skip");
				}
			} finally {
				rmSync(directory, { recursive: true, force: true });
			}
		},
		120_000,
	);

	test.each(catalog.adapters.map((adapter) => adapter.id))(
		"keeps the Pandwind edge case explicit when targeting %s",
		(targetAdapter) => {
			const fixture = completeAdapterMatrixFixtures.find(
				(candidate) =>
					candidate.sourceAdapter === CodemodAdapterId.Pandwind && candidate.scenario === "edge",
			);
			if (fixture === undefined) throw new Error("missing Pandwind edge fixture");
			const directory = mkdtempSync(join(repoRoot, ".tmp-codemod-e2e-"));
			try {
				const { report, source } = runCli(
					directory,
					CodemodAdapterId.Pandwind,
					targetAdapter,
					fixture.source,
					fixture.file,
				);
				const result = report.files[0]!;
				if (targetAdapter === CodemodAdapterId.Pandwind) {
					expect(result.converted).toBe(0);
					expect(result.skipped).toBe(0);
					expect(source).toBe(fixture.source);
					return;
				}
				expect(result.converted + result.skipped).toBeGreaterThan(0);
				if (result.skipped > 0) {
					expect(result.residuals).toBeGreaterThan(0);
					expect(source).toContain("pandwind:migrate-skip");
				}
			} finally {
				rmSync(directory, { recursive: true, force: true });
			}
		},
		120_000,
	);
});
