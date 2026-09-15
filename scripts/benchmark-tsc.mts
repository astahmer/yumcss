/**
 * Measure the Pandwind package typecheck and compare it with checked-in
 * compiler evidence. Instantiation counts are the primary regression signal;
 * memory and check time use wider noise-tolerant bounds.
 *
 * Usage:
 *   nub scripts/benchmark-tsc.mts
 *   nub scripts/benchmark-tsc.mts --samples 5
 *   nub scripts/benchmark-tsc.mts --update
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SNAPSHOT = resolve(ROOT, "plans/evidence/pandwind-tsc.json");
const TSC_ARGS = [
	"--filter",
	"pandwind",
	"exec",
	"tsc",
	"--noEmit",
	"--extendedDiagnostics",
	"--pretty",
	"false",
];

type TscMetrics = {
	files: number;
	instantiations: number;
	memoryUsedKiB: number;
	checkTimeSeconds: number;
	totalTimeSeconds: number;
};

type Snapshot = {
	schema: "pandwind.tsc-performance/1";
	project: "packages/pandwind/tsconfig.json";
	command: string;
	samples: number;
	environment: {
		platform: NodeJS.Platform;
		arch: string;
	};
	updatedAt: string;
	metrics: TscMetrics;
	tolerances: {
		instantiations: number;
		memoryUsedKiB: number;
		checkTimeSeconds: number;
	};
};

type RegressionCheck = readonly [name: string, value: number, reference: number, tolerance: number];

const option = (name: string, fallback: number): number => {
	const index = process.argv.indexOf(name);
	const value = index < 0 ? undefined : Number(process.argv[index + 1]);
	return Number.isInteger(value) && value! > 0 ? value! : fallback;
};

const samples = option("--samples", 3);
const update = process.argv.includes("--update");

const metric = (output: string, label: string, pattern: RegExp): number => {
	const match = output.match(pattern);
	if (match?.[1] === undefined) throw new Error(`tsc diagnostics did not report ${label}`);
	const value = Number(match[1]);
	if (!Number.isFinite(value)) throw new Error(`tsc diagnostics reported invalid ${label}`);
	return value;
};

const runTsc = (): TscMetrics => {
	const result = spawnSync("pnpm", TSC_ARGS, {
		cwd: ROOT,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
	if (result.status !== 0) {
		throw new Error(`pandwind typecheck failed with exit code ${result.status ?? "unknown"}`);
	}
	return {
		files: metric(output, "files", /^Files:\s+(\d+)/m),
		instantiations: metric(output, "instantiations", /^Instantiations:\s+(\d+)/m),
		memoryUsedKiB: metric(output, "memory used", /^Memory used:\s+(\d+)K/m),
		checkTimeSeconds: metric(output, "check time", /^Check time:\s+([\d.]+)s/m),
		totalTimeSeconds: metric(output, "total time", /^Total time:\s+([\d.]+)s/m),
	};
};

const median = (values: readonly number[]): number => {
	const sorted = values.toSorted((left, right) => left - right);
	return sorted[Math.floor(sorted.length / 2)]!;
};

const measure = (): TscMetrics => {
	const results = Array.from({ length: samples }, runTsc);
	return {
		files: median(results.map((result) => result.files)),
		instantiations: median(results.map((result) => result.instantiations)),
		memoryUsedKiB: median(results.map((result) => result.memoryUsedKiB)),
		checkTimeSeconds: median(results.map((result) => result.checkTimeSeconds)),
		totalTimeSeconds: median(results.map((result) => result.totalTimeSeconds)),
	};
};

const measured = measure();
const nextSnapshot: Snapshot = {
	schema: "pandwind.tsc-performance/1",
	project: "packages/pandwind/tsconfig.json",
	command: "pnpm --filter pandwind exec tsc --noEmit --extendedDiagnostics --pretty false",
	samples,
	environment: { platform: process.platform, arch: process.arch },
	updatedAt: new Date().toISOString().slice(0, 10),
	metrics: measured,
	tolerances: {
		instantiations: 0.1,
		memoryUsedKiB: 0.1,
		checkTimeSeconds: 0.5,
	},
};

const baseline = update ? nextSnapshot : (JSON.parse(readFileSync(SNAPSHOT, "utf8")) as Snapshot);

if (update) {
	writeFileSync(SNAPSHOT, `${JSON.stringify(nextSnapshot, null, 2)}\n`);
	console.log(`updated ${SNAPSHOT}`);
} else {
	const checks: RegressionCheck[] = [
		[
			"instantiations",
			measured.instantiations,
			baseline.metrics.instantiations,
			baseline.tolerances.instantiations,
		],
	];
	const sameEnvironment =
		baseline.environment.platform === process.platform &&
		baseline.environment.arch === process.arch;
	if (sameEnvironment) {
		checks.push(
			[
				"memoryUsedKiB",
				measured.memoryUsedKiB,
				baseline.metrics.memoryUsedKiB,
				baseline.tolerances.memoryUsedKiB,
			],
			[
				"checkTimeSeconds",
				measured.checkTimeSeconds,
				baseline.metrics.checkTimeSeconds,
				baseline.tolerances.checkTimeSeconds,
			],
		);
	} else {
		console.warn(
			`skipping memory/check-time comparison: baseline ${baseline.environment.platform}/${baseline.environment.arch}, current ${process.platform}/${process.arch}`,
		);
	}
	for (const [name, value, reference, tolerance] of checks) {
		const limit = reference * (1 + tolerance);
		if (value > limit) {
			throw new Error(
				`${name} regressed from ${reference} to ${value}; limit ${limit.toFixed(2)}. ` +
					"Run nub scripts/benchmark-tsc.mts --update only for an intentional change.",
			);
		}
	}
}

console.log(JSON.stringify({ samples, measured, baseline: baseline.metrics }, null, 2));
