import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { CodemodAdapterId, createBuiltinCodemodCatalog } from "../src/swap/index.ts";
import { adapterContractFixtures } from "../proof/adapter-contract-fixtures.ts";

const repoRoot = resolve(import.meta.dirname, "../../..");
const codemodRoot = resolve(import.meta.dirname, "..");
const catalog = createBuiltinCodemodCatalog();

function runHappyCli(
	sourceAdapter: string,
	targetAdapter: string,
): {
	readonly converted: number;
	readonly skipped: number;
	readonly residuals: number;
	readonly source: string;
} {
	const fixture = adapterContractFixtures.find((item) => item.adapter === sourceAdapter);
	if (fixture === undefined) throw new Error(`missing fixture for ${sourceAdapter}`);
	const directory = mkdtempSync(join(repoRoot, ".tmp-codemod-full-matrix-"));
	const file = join(
		directory,
		`${sourceAdapter}-${targetAdapter}-${fixture.file.replaceAll("/", "-")}`,
	);
	try {
		writeFileSync(file, fixture.source);
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
				file,
			],
			{ cwd: codemodRoot, encoding: "utf8" },
		);
		const report = JSON.parse(output) as {
			readonly files: readonly [
				{ readonly converted: number; readonly skipped: number; readonly residuals: number },
			];
		};
		return { ...report.files[0]!, source: readFileSync(file, "utf8") };
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

const cliMatrixE2e = process.env.PANDWIND_CLI_MATRIX_E2E === "1" ? describe : describe.skip;

cliMatrixE2e("real CLI ordered adapter matrix", () => {
	test("executes every registered happy route in both directions with explicit evidence", () => {
		for (const source of catalog.adapters)
			for (const target of catalog.adapters) {
				const result = runHappyCli(source.id, target.id);
				if (source.id === target.id) {
					expect(result.converted, `${source.id} -> ${target.id}`).toBe(0);
					expect(result.skipped, `${source.id} -> ${target.id}`).toBe(0);
					continue;
				}
				expect(
					result.converted > 0 || result.skipped > 0 || result.residuals > 0,
					`${source.id} -> ${target.id} produced no conversion or residual evidence`,
				).toBe(true);
				if (result.skipped > 0) expect(result.source).toContain("pandwind:migrate-skip");
			}
	}, 600_000);
});
