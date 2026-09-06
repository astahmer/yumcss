import { describe, expect, test } from "vitest";
import { createBuiltinCodemodCatalog, STYLE_MIGRATION_USE_CASE } from "../src/swap/index.ts";
import { completeAdapterMatrixFixtures } from "../proof/adapter-matrix-fixtures.ts";

const catalog = createBuiltinCodemodCatalog();

interface MatrixFileResult {
	readonly file: string;
	readonly converted: number;
	readonly skipped: number;
	readonly residuals: number;
	readonly source: string;
}

async function runInMemoryMatrix(
	sourceAdapter: string,
	targetAdapter: string,
): Promise<readonly MatrixFileResult[]> {
	const fixtures = completeAdapterMatrixFixtures.filter(
		(item) => item.sourceAdapter === sourceAdapter,
	);
	if (fixtures.length === 0) throw new Error(`missing matrix fixtures for ${sourceAdapter}`);
	return Promise.all(
		fixtures.map(async (fixture) => {
			const file = `${sourceAdapter}-${targetAdapter}-${fixture.scenario}-${fixture.file.replaceAll("/", "-")}`;
			const files = new Map([[file, fixture.source]]);
			const result = await STYLE_MIGRATION_USE_CASE.runAsync(fixture.source, {
				from: sourceAdapter,
				to: targetAdapter,
				file,
				root: process.cwd(),
				mode: "safe",
				readFile: (candidate) => files.get(candidate),
				listFiles: () => [...files.keys()],
			});
			return {
				file,
				converted: result.converted,
				skipped: result.skipped,
				residuals: result.residuals.length,
				source: result.code,
			};
		}),
	);
}

describe("in-memory ordered adapter matrix", () => {
	test("executes every registered route in both directions and all scenarios", async () => {
		const routes = catalog.adapters.flatMap((source) =>
			catalog.adapters.map((target) => ({ source, target })),
		);
		const concurrency = 64;
		for (let start = 0; start < routes.length; start += concurrency) {
			const settled = await Promise.allSettled(
				routes.slice(start, start + concurrency).map(async ({ source, target }) => {
					const results = await runInMemoryMatrix(source.id, target.id);
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
						const isMalformed = result.file.includes("-malformed-");
						if (source.id === target.id) {
							expect(result.converted, `${source.id} -> ${target.id}`).toBe(0);
							expect(result.skipped, `${source.id} -> ${target.id}`).toBe(0);
							if (isMalformed) expect(result.source).toContain(`/* unfinished ${source.id} */`);
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
						if (result.residuals > 0) expect(result.source).toContain("pandwind:migrate-skip");
						expect(result.source).not.toContain("adapter capability mismatch");
						if (isMalformed) expect(result.source).toContain(`/* unfinished ${source.id} */`);
					}
				}),
			);
			const failures = settled.flatMap((result) =>
				result.status === "rejected" ? [result.reason] : [],
			);
			expect(failures, `adapter matrix failures in batch ${start}`).toEqual([]);
		}
	}, 120_000);
});
