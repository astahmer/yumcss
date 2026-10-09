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
const yumcssSource =
	'import { createUnsafeCss } from "yumcss/unsafe/css";\n' +
	"const css = createUnsafeCss();\n" +
	'export const card = css.class({ color: "red", padding: "1rem" });\n';
const yumcssFixture = adapterContractFixtures.find(
	(fixture) => fixture.adapter === CodemodAdapterId.YumCSS,
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
	const source = sourceOverride ?? fixture?.source ?? yumcssSource;
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
	test("previews CSS Modules artifacts and writes the component source map", () => {
		const directory = mkdtempSync(join(repoRoot, ".tmp-codemod-css-modules-cli-"));
		const sourceFile = join(directory, "src", "Card.tsx");
		const cssFile = join(directory, "src", "Card.module.css");
		const sourceMapFile = `${cssFile}.map`;
		const source =
			'import styled from "styled-components";\n' +
			'export const Card = styled.div({ color: "red", padding: "1rem" });\n';
		mkdirSync(join(directory, "src"), { recursive: true });
		writeFileSync(sourceFile, source);
		const runMigration = (dryRun: boolean) => {
			const output = execFileSync(
				"nub",
				[
					"src/cli.ts",
					"migrate",
					"--root",
					directory,
					`--from=${CodemodAdapterId.StyledComponents}`,
					`--to=${CodemodAdapterId.CssModules}`,
					...(dryRun ? ["--dry-run"] : []),
					"--no-install",
					"--report=json",
					sourceFile,
				],
				{ cwd: codemodRoot, encoding: "utf8" },
			);
			return JSON.parse(output) as {
				readonly files: readonly [{ readonly generatedFiles: readonly string[] }];
			};
		};

		try {
			const preview = runMigration(true);
			expect(preview.files[0]?.generatedFiles).toEqual([
				"src/Card.module.css",
				"src/Card.module.css.map",
			]);
			expect(readFileSync(sourceFile, "utf8")).toBe(source);
			expect(existsSync(cssFile)).toBe(false);
			expect(existsSync(sourceMapFile)).toBe(false);

			const written = runMigration(false);
			const generatedSourceMap = JSON.parse(readFileSync(sourceMapFile, "utf8")) as {
				readonly sources: readonly string[];
				readonly sourcesContent: readonly string[];
				readonly mappings: string;
			};
			expect(written.files[0]?.generatedFiles).toEqual([
				"src/Card.module.css",
				"src/Card.module.css.map",
			]);
			expect(readFileSync(sourceFile, "utf8")).toContain(
				'import __yumcssCardStyles from "./Card.module.css";',
			);
			expect(existsSync(cssFile)).toBe(true);
			expect(generatedSourceMap).toMatchObject({
				sources: ["Card.tsx"],
				sourcesContent: [source],
			});
			expect(generatedSourceMap.mappings).not.toBe("");
			expect({
				generatedFiles: written.files[0]?.generatedFiles,
				sourceMap: {
					sources: generatedSourceMap.sources,
					mappingsPresent: generatedSourceMap.mappings.length > 0,
				},
			}).toMatchInlineSnapshot(`
				{
				  "generatedFiles": [
				    "src/Card.module.css",
				    "src/Card.module.css.map",
				  ],
				  "sourceMap": {
				    "mappingsPresent": true,
				    "sources": [
				      "Card.tsx",
				    ],
				  },
				}
			`);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	}, 120_000);

	test("preflights generated artifacts against every migrated output before writing", () => {
		const directory = mkdtempSync(join(repoRoot, ".tmp-codemod-cli-collision-"));
		const componentFile = join(directory, "Card.tsx");
		const stylesFile = join(directory, "Card.styles.ts");
		const generatedFile = join(directory, "Card.styles.treat.ts");
		const componentSource =
			'import styled from "@emotion/styled"; export const Card = styled.div({ color: "red" });';
		const stylesSource =
			'import { css } from "@emotion/css"; export const card = css({ color: "blue" });';
		writeFileSync(componentFile, componentSource);
		writeFileSync(stylesFile, stylesSource);

		try {
			expect(() =>
				execFileSync(
					"nub",
					[
						"src/cli.ts",
						"migrate",
						"--root",
						directory,
						"--from=emotion",
						"--to=treat",
						"--safe",
						"--no-install",
						"--report=json",
						`${directory}/*.{ts,tsx}`,
					],
					{ cwd: codemodRoot, encoding: "utf8" },
				),
			).toThrow(/conflict/u);

			expect(readFileSync(componentFile, "utf8")).toBe(componentSource);
			expect(readFileSync(stylesFile, "utf8")).toBe(stylesSource);
			expect(existsSync(generatedFile)).toBe(false);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	}, 120_000);

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

	test("moves a standalone style module and updates its barrel import", () => {
		const directory = mkdtempSync(join(repoRoot, ".tmp-codemod-module-rename-"));
		mkdirSync(join(directory, "src", "ui"), { recursive: true });
		const sourceFile = join(directory, "src/styles.ts");
		const barrelFile = join(directory, "src/index.ts");
		const consumerFile = join(directory, "src/ui/App.tsx");
		const source =
			'import { css } from "@emotion/css";\nexport const card = css({ color: "red", padding: "1rem" });\n';
		const barrel = 'export { card } from "./styles";\n';
		const consumer =
			'import { card } from "../index";\nexport const App = () => <div className={card} />;\n';
		writeFileSync(sourceFile, source);
		writeFileSync(barrelFile, barrel);
		writeFileSync(consumerFile, consumer);
		try {
			const output = execFileSync(
				"nub",
				[
					"src/cli.ts",
					"migrate",
					"--root",
					directory,
					`--from=${CodemodAdapterId.Emotion}`,
					`--to=${CodemodAdapterId.Treat}`,
					"--safe",
					"--no-install",
					"--report=json",
					sourceFile,
				],
				{ cwd: codemodRoot, encoding: "utf8" },
			);
			const report = JSON.parse(output) as {
				readonly files: readonly [
					{
						readonly file: string;
						readonly outputFile?: string;
						readonly converted: number;
						readonly skipped: number;
						readonly residuals: number;
					},
				];
			};
			const fileReport = report.files[0]!;
			const outputFile = join(directory, fileReport.outputFile ?? "");

			expect(fileReport.outputFile).toBe("src/styles.treat.ts");
			expect(fileReport.converted).toBe(1);
			expect(fileReport.skipped).toBe(0);
			expect(fileReport.residuals).toBe(0);
			expect(existsSync(sourceFile)).toBe(false);
			expect(readFileSync(outputFile, "utf8")).toContain('import { style } from "treat";');
			expect(readFileSync(barrelFile, "utf8")).toBe('export { card } from "./styles.treat";\n');
			expect(readFileSync(consumerFile, "utf8")).toBe(consumer);
			expect({
				outputFile: fileReport.outputFile,
				converted: fileReport.converted,
				skipped: fileReport.skipped,
				residuals: fileReport.residuals,
				barrel: readFileSync(barrelFile, "utf8"),
			}).toMatchInlineSnapshot(`
				{
				  "barrel": "export { card } from "./styles.treat";
				",
				  "converted": 1,
				  "outputFile": "src/styles.treat.ts",
				  "residuals": 0,
				  "skipped": 0,
				}
			`);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	}, 120_000);

	test("--force regenerates conflicting project support files", () => {
		const directory = mkdtempSync(join(repoRoot, ".tmp-codemod-force-"));
		writeFileSync(join(directory, "vite.config.ts"), "export default { plugins: [] };\n");

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
			'import "./styled-system/styles.css";\nimport { css } from "styled-system/css";\nexport const title = css({ base: { fontSize: "3xl" } });\n',
		);
		mkdirSync(join(directory, "styled-system"), { recursive: true });
		writeFileSync(join(directory, "styled-system/styles.css"), "@layer utilities;\n");
		mkdirSync(join(directory, "yumcss"), { recursive: true });
		const presetFile = join(directory, "yumcss/preset.ts");
		writeFileSync(presetFile, "export const preset = { conditions: {} };\n");
		try {
			execFileSync(
				"nub",
				[
					"src/cli.ts",
					"migrate",
					"--root",
					directory,
					`--from=${CodemodAdapterId.Panda}`,
					`--to=${CodemodAdapterId.YumCSS}`,
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

	test("composes Next host changes with a YumCSS target alias", () => {
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
					"--to=yumcss-css",
					"--no-install",
					"--report=json",
					sourceFile,
				],
				{ cwd: codemodRoot, encoding: "utf8" },
			);
			expect(readFileSync(join(directory, "yumcss/css.ts"), "utf8")).toContain(
				'import "yumcss-css.css";',
			);
			expect(readFileSync(join(directory, "app/layout.tsx"), "utf8")).toContain(
				'import "yumcss-css.css";',
			);
			expect(readFileSync(join(directory, "next.config.mjs"), "utf8")).toContain(
				"yumcssWebpackCss",
			);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	}, 120_000);

	test.each(catalog.adapters.map((adapter) => adapter.id))(
		"executes the %s -> YumCSS use case with safe source preservation",
		async (sourceAdapter) => {
			const { report, source } = await runInMemory(sourceAdapter, CodemodAdapterId.YumCSS);
			const result = report.files[0]!;
			if (sourceAdapter === CodemodAdapterId.YumCSS) {
				expect(result.converted).toBe(0);
				expect(result.skipped).toBe(0);
				expect(source).toBe(yumcssFixture?.source ?? yumcssSource);
				return;
			}
			expect(result.converted + result.skipped).toBeGreaterThan(0);
			if (result.skipped > 0) {
				expect(result.residuals).toBeGreaterThan(0);
				expect(source).toContain("yumcss:migrate-skip");
			} else expect(source).not.toContain("adapter capability mismatch");
		},
		30_000,
	);

	test.each(catalog.adapters.map((adapter) => adapter.id))(
		"executes the YumCSS -> %s use case with explicit outcome evidence",
		async (targetAdapter) => {
			const { report, source } = await runInMemory(CodemodAdapterId.YumCSS, targetAdapter);
			const result = report.files[0]!;
			if (targetAdapter === CodemodAdapterId.YumCSS) {
				expect(result.converted).toBe(0);
				expect(result.skipped).toBe(0);
				expect(source).toBe(yumcssFixture?.source ?? yumcssSource);
				return;
			}
			expect(result.converted + result.skipped).toBeGreaterThan(0);
			if (result.skipped > 0) {
				expect(result.residuals).toBeGreaterThan(0);
				expect(source).toContain("yumcss:migrate-skip");
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
				CodemodAdapterId.YumCSS,
				fixture.source,
				fixture.file,
			);
			const result = report.files[0]!;
			if (sourceAdapter === CodemodAdapterId.YumCSS) {
				expect(result.converted).toBe(0);
				expect(result.skipped).toBe(0);
				expect(source).toBe(fixture.source);
				return;
			}
			expect(result.converted + result.skipped).toBeGreaterThan(0);
			if (result.skipped > 0) {
				expect(result.residuals).toBeGreaterThan(0);
				expect(source).toContain("yumcss:migrate-skip");
			}
		},
		30_000,
	);

	test.each(catalog.adapters.map((adapter) => adapter.id))(
		"keeps the YumCSS edge case explicit when targeting %s",
		async (targetAdapter) => {
			const fixture = completeAdapterMatrixFixtures.find(
				(candidate) =>
					candidate.sourceAdapter === CodemodAdapterId.YumCSS && candidate.scenario === "edge",
			);
			if (fixture === undefined) throw new Error("missing YumCSS edge fixture");
			const { report, source } = await runInMemory(
				CodemodAdapterId.YumCSS,
				targetAdapter,
				fixture.source,
				fixture.file,
			);
			const result = report.files[0]!;
			if (targetAdapter === CodemodAdapterId.YumCSS) {
				expect(result.converted).toBe(0);
				expect(result.skipped).toBe(0);
				expect(source).toBe(fixture.source);
				return;
			}
			expect(result.converted + result.skipped).toBeGreaterThan(0);
			if (result.skipped > 0) {
				expect(result.residuals).toBeGreaterThan(0);
				expect(source).toContain("yumcss:migrate-skip");
			}
		},
		30_000,
	);
});
