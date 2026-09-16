import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
	generateFixtures,
	libraries,
	scenarios,
	type Library,
	type Scenario,
} from "./generate-fixtures.mts";

type Metrics = {
	files: number;
	symbols: number;
	types: number;
	instantiations: number;
	memoryUsedKiB: number;
	checkTimeSeconds: number;
	totalTimeSeconds: number;
};

type WorkloadResult = {
	library: Library;
	scenario: Scenario;
	samples: number;
	project: string;
	command: string;
	metrics: Metrics;
};

type Snapshot = {
	schema: "pandwind.styling-tsc/1";
	source: "runner/generate-fixtures.mts";
	updatedAt: string;
	samples: number;
	environment: {
		platform: string;
		arch: string;
		node: string;
		typescript: string;
	};
	packages: Record<string, string>;
	workloads: WorkloadResult[];
	tolerances: {
		pandwind: {
			instantiations: number;
			memoryUsedKiB: number;
			checkTimeSeconds: number;
			totalTimeSeconds: number;
		};
	};
};

type Options = {
	samples: number;
	update: boolean;
	library?: Library | undefined;
	scenario?: Scenario | undefined;
};

const root = resolve(import.meta.dirname, "../../..");
const benchmarkRoot = resolve(root, "benchmarks/styling-tsc");
const generatedRoot = resolve(benchmarkRoot, ".generated");
const snapshotPath = resolve(benchmarkRoot, "snapshots/tsc.json");
const reportPath = resolve(benchmarkRoot, "snapshots/tsc.md");
const benchmarkPackageName = "pandwind-styling-tsc-benchmark";
const tscArguments = ["exec", "tsc", "--noEmit", "--extendedDiagnostics", "--pretty", "false"];

const parseOptions = (argumentsList: readonly string[]): Options => {
	let samples = 5;
	let update = false;
	let library: Library | undefined;
	let scenario: Scenario | undefined;

	for (let index = 0; index < argumentsList.length; index += 1) {
		const argument = argumentsList[index];
		if (argument === "--") {
			continue;
		}
		if (argument === "--update") {
			update = true;
			continue;
		}
		if (argument === "--samples") {
			const value = Number(argumentsList[index + 1]);
			if (!Number.isInteger(value) || value < 1) {
				throw new Error("--samples must be a positive integer");
			}
			samples = value;
			index += 1;
			continue;
		}
		if (argument === "--library") {
			const value = argumentsList[index + 1];
			if (!libraries.includes(value as Library)) {
				throw new Error("--library must be one of " + libraries.join(", "));
			}
			library = value as Library;
			index += 1;
			continue;
		}
		if (argument === "--scenario") {
			const value = argumentsList[index + 1];
			if (!scenarios.includes(value as Scenario)) {
				throw new Error("--scenario must be one of " + scenarios.join(", "));
			}
			scenario = value as Scenario;
			index += 1;
			continue;
		}
		throw new Error("Unknown argument: " + argument);
	}

	return { samples, update, library, scenario };
};

const runCommand = (argumentsList: readonly string[]): string => {
	const result = spawnSync("pnpm", argumentsList, {
		cwd: root,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	const output = (result.stdout ?? "") + "\n" + (result.stderr ?? "");
	if (result.status !== 0) {
		throw new Error(
			"Command failed with exit code " +
				String(result.status) +
				": pnpm " +
				argumentsList.join(" ") +
				"\n" +
				output,
		);
	}
	return output;
};

const parseMetric = (output: string, label: string, pattern: RegExp): number => {
	const match = output.match(pattern);
	if (!match) {
		throw new Error("Could not parse " + label + " from tsc output:\n" + output);
	}
	return Number(match[1]);
};

const parseMetrics = (output: string): Metrics => ({
	files: parseMetric(output, "Files", /^Files:\s+(\d+)/m),
	symbols: parseMetric(output, "Symbols", /^Symbols:\s+(\d+)/m),
	types: parseMetric(output, "Types", /^Types:\s+(\d+)/m),
	instantiations: parseMetric(output, "Instantiations", /^Instantiations:\s+(\d+)/m),
	memoryUsedKiB: parseMetric(output, "Memory used", /^Memory used:\s+(\d+)K/m),
	checkTimeSeconds: parseMetric(output, "Check time", /^Check time:\s+([\d.]+)s/m),
	totalTimeSeconds: parseMetric(output, "Total time", /^Total time:\s+([\d.]+)s/m),
});

const median = (values: readonly number[]): number => {
	const sortedValues = values.toSorted((left, right) => left - right);
	const middle = Math.floor(sortedValues.length / 2);
	if (sortedValues.length % 2 === 1) {
		return sortedValues[middle];
	}
	return (sortedValues[middle - 1] + sortedValues[middle]) / 2;
};

const medianMetrics = (samples: readonly Metrics[]): Metrics => ({
	files: samples[0].files,
	symbols: median(samples.map((sample) => sample.symbols)),
	types: median(samples.map((sample) => sample.types)),
	instantiations: median(samples.map((sample) => sample.instantiations)),
	memoryUsedKiB: median(samples.map((sample) => sample.memoryUsedKiB)),
	checkTimeSeconds: median(samples.map((sample) => sample.checkTimeSeconds)),
	totalTimeSeconds: median(samples.map((sample) => sample.totalTimeSeconds)),
});

const runPandaCodegen = (scenario: Scenario): void => {
	const projectRoot = resolve(generatedRoot, "panda", scenario);
	runCommand([
		"--filter",
		benchmarkPackageName,
		"exec",
		"panda",
		"codegen",
		"--clean",
		"--cwd",
		projectRoot,
		"--config",
		resolve(projectRoot, "panda.config.ts"),
	]);
};

const measureWorkload = (library: Library, scenario: Scenario, samples: number): WorkloadResult => {
	const project = ".generated/" + library + "/" + scenario + "/tsconfig.json";
	const projectPath = resolve(benchmarkRoot, project);
	const argumentsList = [
		"--filter",
		benchmarkPackageName,
		...tscArguments,
		"--project",
		projectPath,
	];
	const measuredSamples = Array.from({ length: samples }, () =>
		parseMetrics(runCommand(argumentsList)),
	);

	return {
		library,
		scenario,
		samples,
		project,
		command:
			"pnpm --filter " +
			benchmarkPackageName +
			" " +
			tscArguments.join(" ") +
			" --project " +
			project,
		metrics: medianMetrics(measuredSamples),
	};
};

const readPackageManifest = (): {
	dependencies: Record<string, string>;
	devDependencies: Record<string, string>;
} =>
	JSON.parse(readFileSync(resolve(benchmarkRoot, "package.json"), "utf8")) as {
		dependencies: Record<string, string>;
		devDependencies: Record<string, string>;
	};

const loadPackageVersions = (): Record<string, string> => {
	const manifest = readPackageManifest();
	const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
	const packageNames = [
		"@compiled/react",
		"@emotion/css",
		"@emotion/react",
		"@emotion/styled",
		"@griffel/react",
		"@linaria/core",
		"@linaria/react",
		"@pandacss/dev",
		"@stitches/react",
		"@stylexjs/stylex",
		"@types/aphrodite",
		"@types/react",
		"@vanilla-extract/css",
		"@vanilla-extract/recipes",
		"@vanilla-extract/sprinkles",
		"aphrodite",
		"csstype",
		"fela",
		"goober",
		"jss",
		"next-yak",
		"pandwind",
		"react",
		"react-jss",
		"react-strict-dom",
		"style9",
		"styled-components",
		"treat",
		"typestyle",
		"typescript",
	];
	return Object.fromEntries(
		packageNames.map((packageName) => [packageName, dependencies[packageName]]),
	);
};

const loadTypeScriptVersion = (): string => {
	const output = runCommand(["--filter", benchmarkPackageName, "exec", "tsc", "--version"]);
	const match = output.match(/Version\s+([^\s]+)/);
	if (!match) {
		throw new Error("Could not parse TypeScript version:\n" + output);
	}
	return match[1];
};

const readSnapshot = (): Snapshot | undefined => {
	if (!existsSync(snapshotPath)) {
		return undefined;
	}
	return JSON.parse(readFileSync(snapshotPath, "utf8")) as Snapshot;
};

const buildSnapshot = (
	workloads: readonly WorkloadResult[],
	samples: number,
	typescript: string,
	previous: Snapshot | undefined,
): Snapshot => {
	const measuredKeys = new Set(
		workloads.map((workload) => workload.library + ":" + workload.scenario),
	);
	const preservedWorkloads =
		previous?.workloads.filter(
			(workload) => !measuredKeys.has(workload.library + ":" + workload.scenario),
		) ?? [];

	return {
		schema: "pandwind.styling-tsc/1",
		source: "runner/generate-fixtures.mts",
		updatedAt: new Date().toISOString().slice(0, 10),
		samples,
		environment: {
			platform: process.platform,
			arch: process.arch,
			node: process.version,
			typescript,
		},
		packages: loadPackageVersions(),
		workloads: [...preservedWorkloads, ...workloads].toSorted(
			(left, right) =>
				left.scenario.localeCompare(right.scenario) || left.library.localeCompare(right.library),
		),
		tolerances: {
			pandwind: {
				instantiations: 0.1,
				memoryUsedKiB: 0.1,
				checkTimeSeconds: 0.5,
				totalTimeSeconds: 0.5,
			},
		},
	};
};

const assertNoRegression = (
	measured: readonly WorkloadResult[],
	previous: Snapshot,
	typescript: string,
): void => {
	const previousByKey = new Map(
		previous.workloads.map((workload) => [workload.library + ":" + workload.scenario, workload]),
	);
	const tolerance = previous.tolerances.pandwind;
	const failures: string[] = [];
	if (previous.environment.typescript !== typescript) {
		throw new Error(
			"TypeScript version changed from " +
				previous.environment.typescript +
				" to " +
				typescript +
				"; run with --update to establish a new baseline",
		);
	}
	const sameEnvironment =
		previous.environment.platform === process.platform &&
		previous.environment.arch === process.arch &&
		previous.environment.node === process.version;

	for (const workload of measured) {
		if (workload.library !== "pandwind") {
			continue;
		}
		const baseline = previousByKey.get(workload.library + ":" + workload.scenario);
		if (!baseline) {
			throw new Error(
				"Missing Pandwind baseline for " + workload.scenario + "; run with --update first",
			);
		}
		const checks: [keyof Metrics, number][] = [["instantiations", tolerance.instantiations]];
		if (sameEnvironment) {
			checks.push(
				["memoryUsedKiB", tolerance.memoryUsedKiB],
				["checkTimeSeconds", tolerance.checkTimeSeconds],
				["totalTimeSeconds", tolerance.totalTimeSeconds],
			);
		}
		for (const [metric, allowedIncrease] of checks) {
			const actual = workload.metrics[metric];
			const expected = baseline.metrics[metric];
			if (actual > expected * (1 + allowedIncrease)) {
				failures.push(
					workload.scenario +
						" " +
						metric +
						": " +
						String(actual) +
						" > " +
						String(expected) +
						" baseline + " +
						String(allowedIncrease * 100) +
						"%",
				);
			}
		}
	}

	if (failures.length > 0) {
		throw new Error(
			"Pandwind styling tsc regression detected:\n- " +
				failures.join("\n- ") +
				"\nUpdate intentionally with --update after reviewing the change.",
		);
	}
};

const formatMetric = (value: number, digits = 0): string =>
	digits === 0 ? String(Math.round(value)) : value.toFixed(digits);

const renderReport = (snapshot: Snapshot): string => {
	const headers = [
		"Scenario",
		"Library",
		"Samples",
		"Files",
		"Symbols",
		"Types",
		"Instantiations",
		"Memory (KiB)",
		"Check (s)",
		"Total (s)",
	];
	const rows = snapshot.workloads.map((workload) => [
		workload.scenario,
		workload.library,
		String(workload.samples),
		formatMetric(workload.metrics.files),
		formatMetric(workload.metrics.symbols),
		formatMetric(workload.metrics.types),
		formatMetric(workload.metrics.instantiations),
		formatMetric(workload.metrics.memoryUsedKiB),
		formatMetric(workload.metrics.checkTimeSeconds, 3),
		formatMetric(workload.metrics.totalTimeSeconds, 3),
	]);
	const widths = headers.map((header, index) =>
		Math.max(header.length, ...rows.map((row) => row[index].length)),
	);
	const formatRow = (row: readonly string[], rightAligned: boolean): string =>
		"| " +
		row
			.map((value, index) =>
				rightAligned && index > 1 ? value.padStart(widths[index]) : value.padEnd(widths[index]),
			)
			.join(" | ") +
		" |";
	const separator = widths.map((width, index) =>
		index > 1 ? "-".repeat(width - 1) + ":" : "-".repeat(width),
	);
	const lines = [
		"# Styling TypeScript benchmark",
		"",
		"Generated by runner/generate-fixtures.mts and measured with " +
			snapshot.environment.typescript +
			". Each row records the median of its fresh tsc processes.",
		"",
		"Pandwind workloads are regression-checked. Competitor results are " +
			"descriptive and are not CI gates because their generated artifacts " +
			"and dependency graphs can change independently.",
		"",
		formatRow(headers, false),
		formatRow(separator, false),
	];

	lines.push(...rows.map((row) => formatRow(row, true)));

	lines.push(
		"",
		"Package versions:",
		"",
		...Object.entries(snapshot.packages).map(
			([packageName, version]) => "- " + packageName + ": " + version,
		),
		"",
		"Environment: " +
			snapshot.environment.platform +
			"/" +
			snapshot.environment.arch +
			", " +
			snapshot.environment.node,
		"",
	);
	return lines.join("\n");
};

const printUsage = (): void => {
	console.log(
		[
			"Usage: pnpm run bench:tsc:styling -- [options]",
			"",
			"Options:",
			"  --update                  write the JSON and Markdown baseline",
			"  --samples N               fresh tsc processes per workload (default: 5)",
			"  --library NAME            one of: " + libraries.join(", "),
			"  --scenario NAME           natural or stress",
		].join("\n"),
	);
};

const main = (): void => {
	const argumentsList = process.argv.slice(2);
	if (argumentsList.includes("--help") || argumentsList.includes("-h")) {
		printUsage();
		return;
	}
	const options = parseOptions(argumentsList);
	const selectedLibraries = options.library ? [options.library] : libraries;
	const selectedScenarios = options.scenario ? [options.scenario] : scenarios;
	const typescript = loadTypeScriptVersion();

	generateFixtures();
	if (selectedLibraries.includes("panda")) {
		for (const scenario of selectedScenarios) {
			runPandaCodegen(scenario);
		}
	}

	const workloads = selectedLibraries.flatMap((library) =>
		selectedScenarios.map((scenario) => measureWorkload(library, scenario, options.samples)),
	);
	const previous = readSnapshot();

	if (!options.update) {
		if (!previous) {
			throw new Error("No styling tsc snapshot exists; run with --update first");
		}
		assertNoRegression(workloads, previous, typescript);
		console.log(JSON.stringify({ status: "ok", workloads }, null, 2));
		return;
	}

	const snapshot = buildSnapshot(workloads, options.samples, typescript, previous);
	mkdirSync(resolve(benchmarkRoot, "snapshots"), { recursive: true });
	writeFileSync(snapshotPath, JSON.stringify(snapshot, null, "\t") + "\n");
	writeFileSync(reportPath, renderReport(snapshot));
	console.log(JSON.stringify(snapshot, null, 2));
};

main();
