import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { createBuiltinCodemodCatalog } from "../src/swap/index.ts";
import { completeAdapterMatrixFixtures } from "../proof/adapter-matrix-fixtures.ts";

const repoRoot = resolve(import.meta.dirname, "../../..");
const codemodRoot = resolve(import.meta.dirname, "..");
const catalog = createBuiltinCodemodCatalog();

interface CliFileResult {
	readonly file: string;
	readonly converted: number;
	readonly skipped: number;
	readonly residuals: number;
	readonly source: string;
}

function runCliMatrix(sourceAdapter: string, targetAdapter: string): readonly CliFileResult[] {
	const fixtures = completeAdapterMatrixFixtures.filter(
		(item) => item.sourceAdapter === sourceAdapter,
	);
	if (fixtures.length === 0) throw new Error(`missing matrix fixtures for ${sourceAdapter}`);
	const directory = mkdtempSync(join(repoRoot, ".tmp-codemod-full-matrix-"));
	try {
		const files = fixtures.map((fixture) => {
			const file = join(
				directory,
				`${sourceAdapter}-${targetAdapter}-${fixture.scenario}-${fixture.file.replaceAll("/", "-")}`,
			);
			writeFileSync(file, fixture.source);
			return file;
		});
		const output = execFileSync(
			"pnpm",
			[
				"exec",
				"tsx",
				"src/cli.ts",
				"swap",
				`--from=${sourceAdapter}`,
				`--to=${targetAdapter}`,
				"--safe",
				"--write",
				"--report=json",
				...files,
			],
			{ cwd: codemodRoot, encoding: "utf8" },
		);
		const report = JSON.parse(output) as {
				readonly files: readonly {
					readonly file: string;
					readonly converted: number;
					readonly skipped: number;
					readonly residuals: number;
				}[];
		};
		return report.files.map((result, index) => ({
			...result,
			source: readFileSync(files[index]!, "utf8"),
		}));
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

const cliMatrixE2e = process.env.PANDWIND_CLI_MATRIX_E2E === "1" ? describe : describe.skip;

cliMatrixE2e("real CLI ordered adapter matrix", () => {
	test("executes every registered route in both directions and all scenarios", () => {
		for (const source of catalog.adapters)
			for (const target of catalog.adapters) {
				const results = runCliMatrix(source.id, target.id);
				expect(results).toHaveLength(3);
				const scenarios = results.map((result) =>
					(["happy", "edge", "malformed"] as const).find((scenario) =>
						result.file.includes(`-${scenario}-`),
					),
				);
				expect(scenarios.toSorted(), `${source.id} -> ${target.id}`).toEqual([
					"edge",
					"happy",
					"malformed",
				]);
				for (const result of results) {
					if (source.id === target.id) {
						expect(result.converted, `${source.id} -> ${target.id}`).toBe(0);
						expect(result.skipped, `${source.id} -> ${target.id}`).toBe(0);
						continue;
					}
					expect(
						result.converted > 0 || result.skipped > 0 || result.residuals > 0,
						`${source.id} -> ${target.id} produced no conversion or residual evidence`,
					).toBe(true);
					if (result.skipped > 0) {
						expect(
							result.residuals,
							`${source.id} -> ${target.id} skipped without residual evidence`,
						).toBeGreaterThan(0);
						expect(result.source).toContain("pandwind:migrate-skip");
					}
				}
			}
	}, 600_000);
});
