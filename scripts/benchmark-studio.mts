/**
 * Measure the local Studio path without touching the repository.
 *
 * Usage:
 *   nub scripts/benchmark-studio.mts
 *   nub scripts/benchmark-studio.mts --files 500 --samples 5
 *
 * This is a measurement harness, not a correctness gate: timing thresholds
 * depend on the host. The JSON output is stable enough for before/after
 * comparisons and includes the cache-sensitive warm edit path.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { createStudioCodemodEvaluator } from "../packages/analyze/src/studio/evaluator.ts";
import { createStudioSession } from "../packages/analyze/src/studio/session.ts";
import { createStudioWorkspace } from "../packages/analyze/src/studio/workspace.ts";

const numberOption = (name: string, fallback: number): number => {
	const index = process.argv.indexOf(name);
	const value = index === -1 ? undefined : Number(process.argv[index + 1]);
	return Number.isInteger(value) && value! > 0 ? value! : fallback;
};

const files = numberOption("--files", 100);
const samples = numberOption("--samples", 5);
const root = mkdtempSync(join(tmpdir(), "pandwind-studio-benchmark-"));
const writeSource = (index: number, color: string): string =>
	`import { css } from "@emotion/css";\nexport const Card${index} = css({ color: "${color}", padding: "1rem" });`;

for (let index = 0; index < files; index += 1)
	writeFileSync(join(root, `Card${index}.tsx`), writeSource(index, "red"));

const evaluator = createStudioCodemodEvaluator();
const measure = async (run: () => Promise<number>): Promise<number> => {
	const start = performance.now();
	await run();
	return Math.round((performance.now() - start) * 100) / 100;
};

try {
	const rssBefore = process.memoryUsage().rss;
	const coldOpenMs = await measure(async () => {
		const workspace = createStudioWorkspace({ watcher: { watch: () => () => undefined } });
		const session = createStudioSession({ workspace, evaluation: evaluator, adapters: evaluator });
		await session.open({ root, patterns: ["**/*.tsx"] });
		await session.close();
	});

	const workspace = createStudioWorkspace({ watcher: { watch: () => () => undefined } });
	const session = createStudioSession({ workspace, evaluation: evaluator, adapters: evaluator });
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
	console.log(
		JSON.stringify(
			{
				files,
				samples,
				coldOpenMs,
				warmEvaluateMs:
					Math.round((warmSamples.reduce((sum, value) => sum + value, 0) / samples) * 100) / 100,
				warmP95Ms: p95,
				editMs,
				filesPerSecond: Math.round((files / (Math.max(...warmSamples, 0.001) / 1000)) * 100) / 100,
				outputBytes,
				rssDeltaMiB:
					Math.round(((process.memoryUsage().rss - rssBefore) / 1024 / 1024) * 100) / 100,
			},
			null,
			2,
		),
	);
} finally {
	rmSync(root, { force: true, recursive: true });
}
