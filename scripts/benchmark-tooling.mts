/**
 * Repository-scale tooling benchmark for the source workspace and the three
 * main transformation consumers. The harness is intentionally disposable:
 * it creates synthetic source trees under the OS temp directory, never writes
 * into the repository, and reports timing/memory evidence only.
 *
 * Usage:
 *   nub scripts/benchmark-tooling.mts
 *   nub scripts/benchmark-tooling.mts --files 1000 --samples 5
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { analyzeSource, loadTwConfig } from "../packages/analyze/src/analyze.ts";
import { runAdapterMigration } from "../packages/codemod/src/swap/adapter-migration.ts";
import { createSourceWorkspace } from "../packages/pandwind/src/source-workspace.ts";
import { createInlineTwPluginCore } from "../packages/pandwind/src/vite/index.ts";

type Options = {
	files: number;
	samples: number;
};

type Measurement = {
	coldMs: number;
	warmMs: number;
	p50Ms: number;
	p95Ms: number;
	rssDeltaMiB: number;
	outputCount: number;
	inputBytes: number;
	incrementalMs?: number;
	incrementalOutputCount?: number;
};

type Repository = {
	root: string;
	inputBytes: number;
	files: readonly { path: string; source: string }[];
};

const ROOT = resolve(import.meta.dirname, "..");
const EXAMPLE_TW = resolve(ROOT, "apps/example/src/tw.ts");

function option(name: string, fallback: number): number {
	const index = process.argv.indexOf(name);
	const value = index < 0 ? undefined : Number(process.argv[index + 1]);
	return Number.isFinite(value) && value! > 0 ? value! : fallback;
}

const options: Options = {
	files: option("--files", 250),
	samples: option("--samples", 5),
};

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

function rssMiB(): number {
	return process.memoryUsage().rss / 1024 / 1024;
}

async function measure<T>(
	cold: () => T | Promise<T>,
	warm: () => T | Promise<T>,
	output: (value: T) => number,
	inputBytes: number,
	incremental?: () => T | Promise<T>,
): Promise<Measurement> {
	const before = rssMiB();
	const coldStart = performance.now();
	const coldValue = await cold();
	const coldMs = performance.now() - coldStart;
	const samples: number[] = [];
	let value = coldValue;
	for (let sample = 0; sample < options.samples; sample += 1) {
		const start = performance.now();
		value = await warm();
		samples.push(performance.now() - start);
	}
	const sorted = [...samples].toSorted((left, right) => left - right);
	const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
	const measurement: Measurement = {
		coldMs: round(coldMs),
		warmMs: round(samples.reduce((sum, sample) => sum + sample, 0) / samples.length),
		p50Ms: round(sorted[Math.floor(sorted.length / 2)] ?? 0),
		p95Ms: round(sorted[p95Index] ?? 0),
		rssDeltaMiB: round(rssMiB() - before),
		outputCount: output(value),
		inputBytes,
	};
	if (incremental !== undefined) {
		const incrementalStart = performance.now();
		const incrementalValue = await incremental();
		measurement.incrementalMs = round(performance.now() - incrementalStart);
		measurement.incrementalOutputCount = output(incrementalValue);
	}
	return measurement;
}

function createRepository(fileCount: number): Repository {
	const root = mkdtempSync(join(tmpdir(), "pandwind-tooling-benchmark-"));
	let inputBytes = 0;
	const files: Array<{ path: string; source: string }> = [];
	for (let index = 0; index < fileCount; index += 1) {
		const file = join(root, `src-${index}.tsx`);
		const source = [
			`import { cx, tw } from "./tw";`,
			`export const item${index} = cx(tw({ display: "flex", p: "${index % 8}" }), "text-sm");`,
			`export const View${index} = () => <div className={item${index}} />;`,
		].join("\n");
		writeFileSync(file, source);
		inputBytes += Buffer.byteLength(source);
		files.push({ path: file, source });
	}
	return { root, inputBytes, files };
}

async function benchmarkScanner(repository: Repository): Promise<Measurement> {
	let latest = 0;
	const warmWorkspace = createSourceWorkspace();
	const changed = repository.files[0]!;
	return measure(
		() => {
			const workspace = createSourceWorkspace();
			const files = workspace.collect(["**/*"], repository.root);
			latest = files.length;
			return files;
		},
		() => {
			const files = warmWorkspace.collect(["**/*"], repository.root);
			latest = files.length;
			return files;
		},
		() => latest,
		repository.inputBytes,
		() => {
			writeFileSync(changed.path, `${changed.source}\nexport const changed = true;`);
			warmWorkspace.invalidate(changed.path);
			try {
				const files = warmWorkspace.collect(["**/*"], repository.root);
				latest = files.length;
				return files;
			} finally {
				writeFileSync(changed.path, changed.source);
				warmWorkspace.invalidate(changed.path);
			}
		},
	);
}

async function benchmarkAnalyzer(repository: Repository): Promise<Measurement> {
	const config = loadTwConfig(EXAMPLE_TW);
	const workspace = createSourceWorkspace();
	const paths = workspace.files(["**/*"], repository.root);
	const changed = repository.files[0]!;
	let latest = 0;
	const run = () => {
		latest = 0;
		workspace.forEach(paths, ({ path, source }) => {
			analyzeSource(source, path, { config });
			latest += 1;
		});
		return latest;
	};
	return measure(
		run,
		run,
		(value) => value,
		repository.inputBytes,
		() => {
			writeFileSync(changed.path, `${changed.source}\nexport const changed = true;`);
			workspace.invalidate(changed.path);
			try {
				return run();
			} finally {
				writeFileSync(changed.path, changed.source);
				workspace.invalidate(changed.path);
			}
		},
	);
}

async function benchmarkCodemod(repository: Repository): Promise<Measurement> {
	const sources = repository.files.map((file, index) => ({
		path: file.path,
		source: `import styled from "styled-components";\nexport const Card${index} = styled.div({ color: "red", padding: "1rem" });`,
	}));
	const inputBytes = sources.reduce((total, file) => total + Buffer.byteLength(file.source), 0);
	const changed = sources[0]!;
	let latest = 0;
	const run = () => {
		latest = 0;
		for (const file of sources) {
			const result = runAdapterMigration(file.source, {
				from: "styled-components",
				to: "pandwind",
				file: file.path,
			});
			latest += result.converted;
		}
		return latest;
	};
	return measure(
		run,
		run,
		(value) => value,
		inputBytes,
		() => {
			const original = changed.source;
			changed.source = `${original}\nexport const changed = true;`;
			try {
				return run();
			} finally {
				changed.source = original;
			}
		},
	);
}

async function benchmarkUnplugin(repository: Repository): Promise<Measurement> {
	const plugin = createInlineTwPluginCore();
	const resolver = {
		resolve: async () => ({ id: EXAMPLE_TW }),
	};
	const changed = repository.files[0]!;
	let latest = 0;
	const run = async () => {
		latest = 0;
		for (const file of repository.files) {
			const result = await plugin.transform(file.source, file.path, resolver);
			latest += result?.code.length ?? file.source.length;
		}
		return latest;
	};
	return measure(
		run,
		run,
		(value) => value,
		repository.inputBytes,
		async () => {
			return (
				(
					await plugin.transform(
						`${changed.source}\nexport const changed = true;`,
						changed.path,
						resolver,
					)
				)?.code.length ?? changed.source.length
			);
		},
	);
}

const repository = createRepository(options.files);
try {
	const results = {
		files: options.files,
		samples: options.samples,
		scanner: await benchmarkScanner(repository),
		analyzer: await benchmarkAnalyzer(repository),
		codemod: await benchmarkCodemod(repository),
		unplugin: await benchmarkUnplugin(repository),
	};
	console.log(JSON.stringify(results, null, 2));
} finally {
	rmSync(repository.root, { recursive: true, force: true });
}
