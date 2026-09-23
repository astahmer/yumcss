/**
 * Measure the local Migration Preview path without touching the repository.
 *
 * Usage:
 *   nub scripts/benchmark-migration-preview.mts
 *   nub scripts/benchmark-migration-preview.mts --files 500 --samples 5
 *
 * This is a measurement harness, not a correctness gate: timing thresholds
 * depend on the host. The JSON output is stable enough for before/after
 * comparisons and includes the cache-sensitive warm edit path.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { createMigrationPreviewCodemodEvaluator } from "../packages/analyze/src/migration-preview/evaluator.ts";
import { createMigrationPreviewSession } from "../packages/analyze/src/migration-preview/session.ts";
import { createMigrationPreviewWorkspace } from "../packages/analyze/src/migration-preview/workspace.ts";

const numberOption = (name: string, fallback: number): number => {
	const index = process.argv.indexOf(name);
	const value = index === -1 ? undefined : Number(process.argv[index + 1]);
	return Number.isInteger(value) && value! > 0 ? value! : fallback;
};

const files = numberOption("--files", 100);
const samples = numberOption("--samples", 5);
const root = mkdtempSync(join(tmpdir(), "pandwind-migration-preview-benchmark-"));
const writeSource = (index: number, color: string): string =>
	`import { css } from "@emotion/css";\nexport const Card${index} = css({ color: "${color}", padding: "1rem" });`;

for (let index = 0; index < files; index += 1)
	writeFileSync(join(root, `Card${index}.tsx`), writeSource(index, "red"));

const evaluator = createMigrationPreviewCodemodEvaluator();
const measure = async (run: () => Promise<number>): Promise<number> => {
	const start = performance.now();
	await run();
	return Math.round((performance.now() - start) * 100) / 100;
};

try {
	const rssBefore = process.memoryUsage().rss;
	const coldOpenMs = await measure(async () => {
		const workspace = createMigrationPreviewWorkspace({
			watcher: { watch: () => () => undefined },
		});
		const session = createMigrationPreviewSession({
			workspace,
			evaluation: evaluator,
			adapters: evaluator,
		});
		await session.open({ root, patterns: ["**/*.tsx"] });
		await session.close();
	});

	const workspace = createMigrationPreviewWorkspace({ watcher: { watch: () => () => undefined } });
	const session = createMigrationPreviewSession({
		workspace,
		evaluation: evaluator,
		adapters: evaluator,
	});
	await session.open({ root, patterns: ["**/*.tsx"] });
	await session.switchTarget({ source: "emotion", target: "css.class" });
	const warmSamples: number[] = [];
	let outputBytes = 0;
	for (let index = 0; index < samples; index += 1) {
		warmSamples.push(
			await measure(async () => {
				const snapshot = await session.switchTarget({ source: "emotion", target: "css.class" });
				outputBytes = snapshot.evaluation?.artifacts?.targetBytes ?? 0;
			}),
		);
	}
	const editMs = await measure(async () => {
		const snapshot = await session.edit({
			file: "Card0.tsx",
			source: writeSource(0, "blue"),
		});
		outputBytes = snapshot.evaluation?.artifacts?.targetBytes ?? outputBytes;
	});
	await session.close();

	const sorted = warmSamples.toSorted((left, right) => left - right);
	const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
	const report = {
		files,
		samples,
		coldOpenMs,
		warmEvaluateMs:
			Math.round((warmSamples.reduce((sum, value) => sum + value, 0) / samples) * 100) / 100,
		warmP95Ms: p95,
		editMs,
		filesPerSecond: Math.round((files / (Math.max(...warmSamples, 0.001) / 1000)) * 100) / 100,
		outputBytes,
		rssDeltaMiB: Math.round(((process.memoryUsage().rss - rssBefore) / 1024 / 1024) * 100) / 100,
	};
	const output = process.env.PANDWIND_MIGRATION_PREVIEW_BENCHMARK_OUTPUT;
	if (output !== undefined) writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
	console.log(JSON.stringify(report, null, 2));
} finally {
	rmSync(root, { force: true, recursive: true });
}
