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
	const sorted = [...samples].sort((left, right) => left - right);
	const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
	return {
		coldMs: round(coldMs),
		warmMs: round(samples.reduce((sum, sample) => sum + sample, 0) / samples.length),
		p50Ms: round(sorted[Math.floor(sorted.length / 2)] ?? 0),
		p95Ms: round(sorted[p95Index] ?? 0),
		rssDeltaMiB: round(rssMiB() - before),
		outputCount: output(value),
		inputBytes,
	};
}

function createRepository(fileCount: number): { root: string; inputBytes: number } {
	const root = mkdtempSync(join(tmpdir(), "pandwind-tooling-benchmark-"));
	let inputBytes = 0;
	for (let index = 0; index < fileCount; index += 1) {
		const file = join(root, `src-${index}.tsx`);
		const source = [
			`import { cx, tw } from "./tw";`,
			`export const item${index} = cx(tw({ display: "flex", p: "${index % 8}" }), "text-sm");`,
			`export const View${index} = () => <div className={item${index}} />;`,
		].join("\n");
		writeFileSync(file, source);
		inputBytes += Buffer.byteLength(source);
	}
	return { root, inputBytes };
}

async function benchmarkScanner(repository: {
	root: string;
	inputBytes: number;
}): Promise<Measurement> {
	let latest = 0;
	const warmWorkspace = createSourceWorkspace();
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
	);
}

async function benchmarkAnalyzer(repository: {
	root: string;
	inputBytes: number;
}): Promise<Measurement> {
	const config = loadTwConfig(EXAMPLE_TW);
	const workspace = createSourceWorkspace();
	const sourceFiles = workspace.collect(["**/*"], repository.root);
	let latest = 0;
	const run = () => {
		latest = 0;
		for (const file of sourceFiles) {
			analyzeSource(file.source, file.path, { config });
			latest += 1;
		}
		return latest;
	};
	return measure(run, run, (value) => value, repository.inputBytes);
}

async function benchmarkCodemod(inputBytes: number): Promise<Measurement> {
	const source = `import styled from "styled-components";\nexport const Card = styled.div({ color: "red", padding: "1rem" });`;
	let latest = 0;
	const run = () => {
		const result = runAdapterMigration(source, {
			from: "styled-components",
			to: "pandwind",
			file: "Card.tsx",
		});
		latest = result.code.length;
		return result;
	};
	return measure(run, run, (value) => value.converted, inputBytes);
}

async function benchmarkUnplugin(repository: {
	root: string;
	inputBytes: number;
}): Promise<Measurement> {
	const file = join(repository.root, "hot.tsx");
	const source = `import { tw } from "./tw";\nexport const className = tw({ display: "flex", p: "4", text: "sm" });`;
	writeFileSync(file, source);
	const plugin = createInlineTwPluginCore();
	const resolver = {
		resolve: async () => ({ id: EXAMPLE_TW }),
	};
	let latest = 0;
	const run = async () => {
		const result = await plugin.transform(source, file, resolver);
		latest = result?.code.length ?? source.length;
		return result;
	};
	return measure(run, run, (value) => value?.code.length ?? latest, repository.inputBytes);
}

const repository = createRepository(options.files);
try {
	const results = {
		files: options.files,
		samples: options.samples,
		scanner: await benchmarkScanner(repository),
		analyzer: await benchmarkAnalyzer(repository),
		codemod: await benchmarkCodemod(repository.inputBytes),
		unplugin: await benchmarkUnplugin(repository),
	};
	console.log(JSON.stringify(results, null, 2));
} finally {
	rmSync(repository.root, { recursive: true, force: true });
}
