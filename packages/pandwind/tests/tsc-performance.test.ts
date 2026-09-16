import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { writePerformanceSummary } from "../../../scripts/render-performance-summary.mts";

const ROOT = resolve(import.meta.dirname, "..");
const SNAPSHOT = resolve(ROOT, "tests/snapshots/tsc.json.snap");
const SAMPLES = 3;
const MINIMUM_CHECK_TIME_INCREASE_SECONDS = 0.05;
const MINIMUM_TOTAL_TIME_INCREASE_SECONDS = 0.1;
const TSC_ARGUMENTS = [
	"exec",
	"tsc",
	"--ignoreConfig",
	"--noEmit",
	"--extendedDiagnostics",
	"--pretty",
	"false",
	"--target",
	"ES2022",
	"--module",
	"ESNext",
	"--moduleResolution",
	"Bundler",
	"--customConditions",
	"pandwind",
	"--lib",
	"ES2023,DOM",
	"--strict",
	"--noUncheckedIndexedAccess",
	"--noImplicitOverride",
	"--isolatedModules",
	"--verbatimModuleSyntax",
	"--allowImportingTsExtensions",
	"--skipLibCheck",
	"--forceConsistentCasingInFileNames",
	"--types",
	"node",
] as const;

const SCENARIOS = [
	{
		name: "css.default",
		fixture: "tests/fixtures/tsc/css-default.ts",
		description: "default preset with repeated static css and class calls",
	},
	{
		name: "css.preset",
		fixture: "tests/fixtures/tsc/css-custom.ts",
		description: "define namespace, semantic tokens, palettes, and strict css",
	},
	{
		name: "css.real-world.theme",
		fixture: "tests/fixtures/tsc/real-world-theme.ts",
		description: "complete anonymized product theme and preset construction",
	},
	{
		name: "css.real-world.usage",
		fixture: "tests/fixtures/tsc/real-world-usage.ts",
		description: "repeated component styles using a complete product preset",
	},
	{
		name: "css.dynamic",
		fixture: "tests/fixtures/tsc/css-dynamic.ts",
		description: "vars, props, raw, groups, and named runtime inputs",
	},
	{
		name: "design",
		fixture: "tests/fixtures/tsc/design.ts",
		description: "intent-oriented frame, layout, and text modules",
	},
	{
		name: "runtime",
		fixture: "tests/fixtures/tsc/runtime.ts",
		description: "live runtime css and design css bound to a sheet",
	},
	{
		name: "composition",
		fixture: "tests/fixtures/tsc/composition.ts",
		description: "cx with css atoms, class strings, arrays, and vars",
	},
	{
		name: "tw",
		fixture: "tests/fixtures/tsc/tw.ts",
		description: "typed tw object with variants and conflict metadata",
	},
	{
		name: "app",
		fixture: "tests/fixtures/tsc/app.ts",
		description: "combined component-style usage across the public APIs",
	},
] as const;

type Metrics = {
	files: number;
	symbols: number;
	types: number;
	instantiations: number;
	memoryUsedKiB: number;
	checkTimeSeconds: number;
	totalTimeSeconds: number;
};

type ScenarioResult = {
	name: (typeof SCENARIOS)[number]["name"];
	fixture: string;
	description: string;
	command: string;
	samples: number;
	metrics: Metrics;
};

type Snapshot = {
	schema: "pandwind.tsc-api/1";
	source: "tests/tsc-performance.test.ts";
	updatedAt: string;
	samples: number;
	environment: {
		platform: NodeJS.Platform;
		arch: string;
		node: string;
		typescript: string;
	};
	scenarios: ScenarioResult[];
	tolerances: {
		instantiations: number;
		memoryUsedKiB: number;
		checkTimeSeconds: number;
		totalTimeSeconds: number;
	};
};

const metric = (output: string, label: string, pattern: RegExp): number => {
	const match = output.match(pattern);
	if (match?.[1] === undefined) throw new Error(`tsc diagnostics did not report ${label}`);
	const value = Number(match[1]);
	if (!Number.isFinite(value)) throw new Error(`tsc diagnostics reported invalid ${label}`);
	return value;
};

const runTsc = (fixture: string): Metrics => {
	const result = spawnSync("pnpm", [...TSC_ARGUMENTS, fixture], {
		cwd: ROOT,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
	if (result.status !== 0) {
		throw new Error(`TSC benchmark fixture failed: ${fixture}\n${output}`);
	}
	return {
		files: metric(output, "files", /^Files:\s+(\d+)/m),
		symbols: metric(output, "symbols", /^Symbols:\s+(\d+)/m),
		types: metric(output, "types", /^Types:\s+(\d+)/m),
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

const medianMetrics = (samples: readonly Metrics[]): Metrics => ({
	files: samples[0]!.files,
	symbols: median(samples.map((sample) => sample.symbols)),
	types: median(samples.map((sample) => sample.types)),
	instantiations: median(samples.map((sample) => sample.instantiations)),
	memoryUsedKiB: median(samples.map((sample) => sample.memoryUsedKiB)),
	checkTimeSeconds: median(samples.map((sample) => sample.checkTimeSeconds)),
	totalTimeSeconds: median(samples.map((sample) => sample.totalTimeSeconds)),
});

const measureScenario = (scenario: (typeof SCENARIOS)[number]): ScenarioResult => {
	const metrics = medianMetrics(Array.from({ length: SAMPLES }, () => runTsc(scenario.fixture)));
	return {
		...scenario,
		command: `pnpm ${TSC_ARGUMENTS.join(" ")} ${scenario.fixture}`,
		samples: SAMPLES,
		metrics,
	};
};

const typescriptVersion = (): string => {
	const result = spawnSync("pnpm", ["exec", "tsc", "--version"], {
		cwd: ROOT,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
	const match = output.match(/Version\s+([^\s]+)/);
	if (result.status !== 0 || match?.[1] === undefined) {
		throw new Error(`could not determine the TypeScript version\n${output}`);
	}
	return match[1];
};

const updatingSnapshots = (): boolean => {
	const snapshotState = (
		expect.getState() as unknown as { snapshotState?: { _updateSnapshot?: string } }
	).snapshotState;
	return snapshotState?._updateSnapshot === "all";
};

const buildSnapshot = (scenarios: readonly ScenarioResult[], typescript: string): Snapshot => ({
	schema: "pandwind.tsc-api/1",
	source: "tests/tsc-performance.test.ts",
	updatedAt: new Date().toISOString().slice(0, 10),
	samples: SAMPLES,
	environment: {
		platform: process.platform,
		arch: process.arch,
		node: process.version,
		typescript,
	},
	scenarios: [...scenarios],
	tolerances: {
		instantiations: 0.1,
		memoryUsedKiB: 0.1,
		checkTimeSeconds: 0.5,
		totalTimeSeconds: 0.5,
	},
});

const assertNoRegression = (
	measured: readonly ScenarioResult[],
	baseline: Snapshot,
	typescript: string,
): void => {
	if (baseline.schema !== "pandwind.tsc-api/1") {
		throw new Error(`unsupported TSC snapshot schema ${baseline.schema}`);
	}
	if (baseline.environment.typescript !== typescript) {
		throw new Error(
			`TypeScript changed from ${baseline.environment.typescript} to ${typescript}; run pnpm --filter pandwind run test:tsc -- -u to establish a new baseline`,
		);
	}
	const baselineByName = new Map(baseline.scenarios.map((scenario) => [scenario.name, scenario]));
	const measuredNames = new Set(measured.map((scenario) => scenario.name));
	const baselineNames = new Set(baseline.scenarios.map((scenario) => scenario.name));
	const missing = measured
		.filter((scenario) => !baselineNames.has(scenario.name))
		.map((scenario) => scenario.name);
	const removed = baseline.scenarios
		.filter((scenario) => !measuredNames.has(scenario.name))
		.map((scenario) => scenario.name);
	if (missing.length > 0 || removed.length > 0) {
		throw new Error(
			`TSC scenario snapshot changed; missing baseline: ${missing.join(", ") || "none"}; removed scenarios: ${removed.join(", ") || "none"}. Update intentionally with -u.`,
		);
	}

	const sameEnvironment =
		baseline.environment.platform === process.platform &&
		baseline.environment.arch === process.arch &&
		baseline.environment.node === process.version;
	const failures: string[] = [];
	for (const scenario of measured) {
		const reference = baselineByName.get(scenario.name)!;
		const checks: Array<[keyof Metrics, number]> = [
			["instantiations", baseline.tolerances.instantiations],
		];
		if (sameEnvironment) {
			checks.push(
				["memoryUsedKiB", baseline.tolerances.memoryUsedKiB],
				["checkTimeSeconds", baseline.tolerances.checkTimeSeconds],
				["totalTimeSeconds", baseline.tolerances.totalTimeSeconds],
			);
		}
		for (const [metricName, tolerance] of checks) {
			const actual = scenario.metrics[metricName];
			const expected = reference.metrics[metricName];
			const minimumIncrease =
				metricName === "checkTimeSeconds"
					? MINIMUM_CHECK_TIME_INCREASE_SECONDS
					: metricName === "totalTimeSeconds"
						? MINIMUM_TOTAL_TIME_INCREASE_SECONDS
						: 0;
			const limit = Math.max(expected * (1 + tolerance), expected + minimumIncrease);
			if (actual > limit) {
				failures.push(
					`${scenario.name} ${metricName}: ${actual} > ${expected} baseline (limit ${limit.toFixed(3)})`,
				);
			}
		}
	}
	if (failures.length > 0) {
		throw new Error(
			`Pandwind API TSC regression detected:\n- ${failures.join("\n- ")}\nUpdate intentionally with pnpm --filter pandwind run test:tsc -- -u after reviewing the change.`,
		);
	}
};

test("public API typecheck scenarios stay within the recorded evidence band", async () => {
	const measured = SCENARIOS.map(measureScenario);
	const snapshot = buildSnapshot(measured, typescriptVersion());
	if (updatingSnapshots()) {
		await expect(JSON.stringify(snapshot, null, "\t")).toMatchFileSnapshot(SNAPSHOT);
		writePerformanceSummary();
		return;
	}
	if (!existsSync(SNAPSHOT)) {
		throw new Error(
			`missing ${SNAPSHOT}; run pnpm --filter pandwind run test:tsc -- -u to record the initial baseline`,
		);
	}
	const baseline = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as Snapshot;
	assertNoRegression(measured, baseline, snapshot.environment.typescript);
});
