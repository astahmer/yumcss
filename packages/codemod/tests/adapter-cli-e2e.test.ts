import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	STYLE_MIGRATION_USE_CASE,
	createBuiltinCodemodCatalog,
} from "../src/swap/index.ts";
import { adapterContractFixtures } from "../proof/adapter-contract-fixtures.ts";
import { completeAdapterMatrixFixtures } from "../proof/adapter-matrix-fixtures.ts";

const repoRoot = resolve(import.meta.dirname, "../../..");
const codemodRoot = resolve(import.meta.dirname, "..");
const catalog = createBuiltinCodemodCatalog();
const pandwindSource =
	'import { createUnsafeCss } from "pandwind/unsafe/css";\n' +
	"const css = createUnsafeCss();\n" +
	'export const card = css.class({ color: "red", padding: "1rem" });\n';
const pandwindFixture = adapterContractFixtures.find(
	(fixture) => fixture.adapter === CodemodAdapterId.Pandwind,
);
interface MigrationRunResult {
	readonly report: {
		readonly files: readonly [
			{ readonly converted: number; readonly skipped: number; readonly residuals: number },
		];
	};
	readonly source: string;
}

async function runInMemory(
	from: string,
	to: string,
	sourceOverride?: string,
	fileOverride?: string,
): Promise<MigrationRunResult> {
	// Keep the large route matrix in-process. The first test below remains the
	// real CLI boundary proof for argument parsing, file discovery, and writes.
	const fixture = adapterContractFixtures.find((candidate) => candidate.adapter === from);
	const file = fileOverride ?? fixture?.file ?? "source.tsx";
	const source = sourceOverride ?? fixture?.source ?? pandwindSource;
	const files = new Map([[file, source]]);
	const result = await STYLE_MIGRATION_USE_CASE.runAsync(source, {
		from,
		to,
		file,
		root: repoRoot,
		mode: "safe",
		readFile: (candidate) => files.get(candidate),
		listFiles: () => [...files.keys()],
	});
	return {
		report: {
			files: [
				{
					converted: result.converted,
					skipped: result.skipped,
					residuals: result.residuals.length,
				},
			],
		},
		source: result.code,
	};
}

describe("adapter migration e2e matrix", () => {
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
				"nub",
				[
					"src/cli.ts",
					"migrate",
					"--root",
					directory,
					`--from=${CodemodAdapterId.VueStyled}`,
					`--to=${CodemodAdapterId.Stitches}`,
					"--safe",
					"--no-install",
					"--report=json",
					file,
				],
				{ cwd: codemodRoot, encoding: "utf8" },
			);
			const report = JSON.parse(output) as {
				readonly files: readonly [
					{
						readonly file: string;
						readonly outputFile?: string;
						readonly canonical: { readonly checked: boolean; readonly equal: boolean };
					},
				];
			};
			const outputFile = report.files[0]?.outputFile;
			expect(outputFile).toMatch(/App\.tsx$/u);
			expect(existsSync(file)).toBe(false);
			expect(outputFile === undefined ? false : existsSync(resolve(directory, outputFile))).toBe(
				true,
			);
			expect(report.files[0]?.canonical).toMatchObject({ checked: true, equal: true });
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	}, 120_000);

	test("--force regenerates conflicting project support files", () => {
		const directory = mkdtempSync(join(repoRoot, ".tmp-codemod-force-"));
		const sourceFile = join(directory, "App.tsx");
		writeFileSync(
			join(directory, "package.json"),
			JSON.stringify({ name: "codemod-force-fixture", private: true }),
		);
		writeFileSync(
			join(directory, "panda.config.ts"),
			"export default { conditions: { extend: { midnight: '[data-theme=midnight] &' } } };\n",
		);
		writeFileSync(
			sourceFile,
			'import { css } from "styled-system/css";\nexport const title = css({ base: { fontSize: "3xl" } });\n',
		);
		mkdirSync(join(directory, "pandwind"), { recursive: true });
		const presetFile = join(directory, "pandwind/preset.ts");
		writeFileSync(presetFile, "export const pandwindPreset = { conditions: {} };\n");
		try {
			execFileSync(
				"nub",
				[
					"src/cli.ts",
					"migrate",
					"--root",
					directory,
					`--from=${CodemodAdapterId.Panda}`,
					`--to=${CodemodAdapterId.Pandwind}`,
					"--force",
					"--no-install",
					"--report=json",
					sourceFile,
				],
				{ cwd: codemodRoot, encoding: "utf8" },
			);
			const preset = readFileSync(presetFile, "utf8");
			expect(preset).toMatch(/["']?base["']?\s*:\s*""/u);
			expect(preset).toContain('"midnight": "[data-theme=midnight] &"');
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	}, 120_000);

	test("composes Next host changes with a Pandwind target alias", () => {
		const directory = mkdtempSync(join(repoRoot, ".tmp-codemod-next-"));
		mkdirSync(join(directory, "app"), { recursive: true });
		const sourceFile = join(directory, "App.tsx");
		writeFileSync(
			join(directory, "package.json"),
			JSON.stringify({
				name: "codemod-next-fixture",
				private: true,
				dependencies: { next: "15.0.0", "styled-components": "6.0.0" },
			}),
		);
		writeFileSync(
			join(directory, "next.config.mjs"),
			"const config = {};\nexport default config;\n",
		);
		writeFileSync(
			join(directory, "app/layout.tsx"),
			"export default function Layout() { return <div />; }\n",
		);
		writeFileSync(
			sourceFile,
			'import styled from "styled-components";\nexport const Card = styled.div`color: red;`;\n',
		);
		try {
			execFileSync(
				"nub",
				[
					"src/cli.ts",
					"migrate",
					"--root",
					directory,
					`--from=${CodemodAdapterId.StyledComponents}`,
					"--to=pandwind-css",
					"--no-install",
					"--report=json",
					sourceFile,
				],
				{ cwd: codemodRoot, encoding: "utf8" },
			);
			expect(readFileSync(join(directory, "pandwind/css.ts"), "utf8")).toContain(
				'import "pandwind-css.css";',
			);
			expect(readFileSync(join(directory, "app/layout.tsx"), "utf8")).toContain(
				'import "pandwind-css.css";',
			);
			expect(readFileSync(join(directory, "next.config.mjs"), "utf8")).toContain(
				"pandwindWebpackCss",
			);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	}, 120_000);

	test.each(catalog.adapters.map((adapter) => adapter.id))(
		"executes the %s -> Pandwind use case with safe source preservation",
		async (sourceAdapter) => {
			const { report, source } = await runInMemory(sourceAdapter, CodemodAdapterId.Pandwind);
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
			} else expect(source).not.toContain("adapter capability mismatch");
		},
		30_000,
	);

	test.each(catalog.adapters.map((adapter) => adapter.id))(
		"executes the Pandwind -> %s use case with explicit outcome evidence",
		async (targetAdapter) => {
			const { report, source } = await runInMemory(CodemodAdapterId.Pandwind, targetAdapter);
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
			} else expect(source).not.toContain("adapter capability mismatch");
		},
		30_000,
	);

	test.each(catalog.adapters.map((adapter) => adapter.id))(
		"keeps the %s edge case explicit through the migration use case",
		async (sourceAdapter) => {
			const fixture = completeAdapterMatrixFixtures.find(
				(candidate) => candidate.sourceAdapter === sourceAdapter && candidate.scenario === "edge",
			);
			if (fixture === undefined) throw new Error(`missing edge fixture for ${sourceAdapter}`);
			const { report, source } = await runInMemory(
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
		},
		30_000,
	);

	test.each(catalog.adapters.map((adapter) => adapter.id))(
		"keeps the Pandwind edge case explicit when targeting %s",
		async (targetAdapter) => {
			const fixture = completeAdapterMatrixFixtures.find(
				(candidate) =>
					candidate.sourceAdapter === CodemodAdapterId.Pandwind && candidate.scenario === "edge",
			);
			if (fixture === undefined) throw new Error("missing Pandwind edge fixture");
			const { report, source } = await runInMemory(
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
		},
		30_000,
	);
});
