import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
import { createBuiltinCodemodCatalog } from "../src/swap/index.ts";
import { completeAdapterMatrixFixtures } from "../proof/adapter-matrix-fixtures.ts";

const repoRoot = resolve(import.meta.dirname, "../../..");
const codemodRoot = resolve(import.meta.dirname, "..");
const catalog = createBuiltinCodemodCatalog();
const execFileAsync = promisify(execFile);

interface CliFileResult {
	readonly file: string;
	readonly converted: number;
	readonly skipped: number;
	readonly residuals: number;
}

async function runCliMatrix(
	sourceAdapter: string,
	targetAdapter: string,
): Promise<readonly CliFileResult[]> {
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
		const { stdout } = await execFileAsync(
			process.execPath,
			[
				"--import",
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
		const report = JSON.parse(stdout) as {
			readonly files: readonly {
				readonly file: string;
				readonly converted: number;
				readonly skipped: number;
				readonly residuals: number;
			}[];
		};
		return report.files;
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

const cliMatrixE2e = process.env.PANDWIND_CLI_MATRIX_E2E === "1" ? describe : describe.skip;

cliMatrixE2e("real CLI ordered adapter matrix", () => {
	test("executes every registered route in both directions and all scenarios", async () => {
		const routes = catalog.adapters.flatMap((source) =>
			catalog.adapters.map((target) => ({ source, target })),
		);
		const concurrency = 64;
		for (let start = 0; start < routes.length; start += concurrency) {
			await Promise.all(
				routes.slice(start, start + concurrency).map(async ({ source, target }) => {
					const results = await runCliMatrix(source.id, target.id);
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
						if (result.skipped > 0)
							expect(
								result.residuals,
								`${source.id} -> ${target.id} skipped without residual evidence`,
							).toBeGreaterThan(0);
					}
				}),
			);
		}
	}, 600_000);
});
