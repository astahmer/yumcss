import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
	generatePandwindPresetSource,
	pandwindApp,
	pandwindStyles,
	pandwindTokenNames,
} from "./generate-fixtures.mts";

type Mode = "inferred" | "generated";
type Scenario = "minimal" | "medium" | "large" | "huge";

const modes: readonly Mode[] = ["inferred", "generated"];
const scenarios: readonly Scenario[] = ["minimal", "medium", "large", "huge"];
const scenarioOptions: Record<Scenario, { componentCount: number; catalogCount: number }> = {
	minimal: { componentCount: 8, catalogCount: 16 },
	medium: { componentCount: 32, catalogCount: 64 },
	large: { componentCount: 128, catalogCount: 256 },
	huge: { componentCount: 512, catalogCount: 1024 },
};

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
	mode: Mode;
	scenario: Scenario;
	samples: number;
	project: string;
	command: string;
	metrics: Metrics;
	generatedDeclarationBytes?: number;
};

type Snapshot = {
	schema: "pandwind.generated-types-poc/1";
	source: "runner/generated-types-poc.mts";
	updatedAt: string;
	samples: number;
	environment: {
		platform: string;
		arch: string;
		node: string;
		typescript: string;
	};
	workloads: WorkloadResult[];
	tolerances: {
		instantiations: number;
		memoryUsedKiB: number;
		checkTimeSeconds: number;
		totalTimeSeconds: number;
		timingNoiseFloorSeconds: number;
	};
};

type Options = {
	samples: number;
	update: boolean;
	mode?: Mode;
	scenario?: Scenario;
};

const root = resolve(import.meta.dirname, "../../..");
const benchmarkRoot = resolve(root, "benchmarks/styling-tsc");
const generatedRoot = resolve(benchmarkRoot, ".generated/generated-types-poc");
const snapshotPath = resolve(benchmarkRoot, "snapshots/generated-types-poc.json");
const reportPath = resolve(benchmarkRoot, "snapshots/generated-types-poc.md");
const benchmarkPackageName = "pandwind-styling-tsc-benchmark";
const tscArguments = ["exec", "tsc", "--noEmit", "--extendedDiagnostics", "--pretty", "false"];

const parseOptions = (argumentsList: readonly string[]): Options => {
	let samples = 3;
	let update = false;
	let mode: Mode | undefined;
	let scenario: Scenario | undefined;

	for (let index = 0; index < argumentsList.length; index += 1) {
		const argument = argumentsList[index];
		if (argument === "--") continue;
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
		if (argument === "--mode") {
			const value = argumentsList[index + 1];
			if (value !== "inferred" && value !== "generated") {
				throw new Error("--mode must be inferred or generated");
			}
			mode = value;
			index += 1;
			continue;
		}
		if (argument === "--scenario") {
			const value = argumentsList[index + 1];
			if (value !== "minimal" && value !== "medium" && value !== "large" && value !== "huge") {
				throw new Error("--scenario must be minimal, medium, large, or huge");
			}
			scenario = value;
			index += 1;
			continue;
		}
		throw new Error("Unknown argument: " + argument);
	}

	return {
		samples,
		update,
		...(mode === undefined ? {} : { mode }),
		...(scenario === undefined ? {} : { scenario }),
	};
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
	if (sortedValues.length % 2 === 1) return sortedValues[middle];
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

const union = (values: readonly string[]): string =>
	values.map((value) => JSON.stringify(value)).join(" | ");
const openUnion = (values: readonly string[]): string => union(values) + " | OpenString";

const generatedTypesSource = (catalogCount: number): string => {
	const names = pandwindTokenNames(catalogCount);
	const colorNames = [...names.colors, "colorPalette.solid", "colorPalette.contrast"];
	const lines = [
		'import type { CssFn } from "pandwind/css";',
		"",
		"type OpenString = string & {};",
		"type ColorValue = " + openUnion(colorNames) + ";",
		"type SpacingValue = " + union(names.spacing) + " | number | OpenString;",
		"type RadiusValue = " + union(names.radii) + " | OpenString;",
		"",
		"export type GeneratedStyle = {",
		"\tdisplay?: " + openUnion(["flex", "grid"]) + ";",
		"\tcolor?: ColorValue;",
		"\tbackgroundColor?: ColorValue;",
		"\tpadding?: SpacingValue;",
		"\tmargin?: SpacingValue;",
		"\tgap?: SpacingValue;",
		"\tborderRadius?: RadiusValue;",
		'\tcolorPalette?: "brand";',
		"\t_hover?: GeneratedStyle;",
		"\t_dark?: GeneratedStyle;",
		"\tsm?: GeneratedStyle;",
		"\tmd?: GeneratedStyle;",
		"};",
		"",
		"type GeneratedDynamicValue =",
		"\t| string",
		"\t| number",
		"\t| boolean",
		"\t| null",
		"\t| GeneratedDynamicStyle",
		"\t| readonly GeneratedDynamicValue[]",
		"\t| undefined;",
		"",
		"export type GeneratedDynamicStyle = {",
		"\tdisplay?: GeneratedDynamicValue;",
		"\tcolor?: GeneratedDynamicValue;",
		"\tbackgroundColor?: GeneratedDynamicValue;",
		"\tpadding?: GeneratedDynamicValue;",
		"\tmargin?: GeneratedDynamicValue;",
		"\tgap?: GeneratedDynamicValue;",
		"\tborderRadius?: GeneratedDynamicValue;",
		"\tcolorPalette?: GeneratedDynamicValue;",
		"\t_hover?: GeneratedDynamicStyle;",
		"\t_dark?: GeneratedDynamicStyle;",
		"\tsm?: GeneratedDynamicStyle;",
		"\tmd?: GeneratedDynamicStyle;",
		"};",
		"",
		"export type GeneratedCss = CssFn<GeneratedStyle, GeneratedDynamicStyle>;",
		"export declare const css: GeneratedCss;",
	];
	return lines.join("\n") + "\n";
};

const generatedStylesSource =
	[
		'import type { GeneratedCss } from "./generated-types.d.ts";',
		"",
		"export declare const css: GeneratedCss;",
	].join("\n") + "\n";

const tsconfigSource = (mode: Mode): string =>
	JSON.stringify(
		{
			extends: "../../../../tsconfig.base.json",
			compilerOptions: { types: [] },
			include:
				mode === "inferred"
					? ["src/**/*.ts"]
					: ["src/app.ts", "src/styles-generated.ts", "src/generated-types.d.ts"],
		},
		null,
		2,
	) + "\n";

const writeFile = (projectRoot: string, fileName: string, content: string): void => {
	const path = resolve(projectRoot, fileName);
	mkdirSync(resolve(path, ".."), { recursive: true });
	writeFileSync(path, content);
};

const generateFixtures = (): void => {
	rmSync(generatedRoot, { recursive: true, force: true });

	for (const mode of modes) {
		for (const scenario of scenarios) {
			const options = scenarioOptions[scenario];
			const projectRoot = resolve(generatedRoot, mode, scenario);
			mkdirSync(projectRoot, { recursive: true });
			writeFile(projectRoot, "tsconfig.json", tsconfigSource(mode));
			const app = pandwindApp(options.componentCount, {
				includeColorPalette: true,
				includeCxVars: true,
				includeRaw: true,
			});
			if (mode === "inferred") {
				writeFile(projectRoot, "src/preset.ts", generatePandwindPresetSource(options.catalogCount));
				writeFile(projectRoot, "src/styles.ts", pandwindStyles());
				writeFile(projectRoot, "src/app.ts", app);
				continue;
			}
			writeFile(
				projectRoot,
				"src/generated-types.d.ts",
				generatedTypesSource(options.catalogCount),
			);
			writeFile(projectRoot, "src/styles-generated.ts", generatedStylesSource);
			writeFile(
				projectRoot,
				"src/app.ts",
				app.replace('from "./styles.ts";', 'from "./styles-generated.ts";'),
			);
		}
	}
};

const measureWorkload = (mode: Mode, scenario: Scenario, samples: number): WorkloadResult => {
	const project = ".generated/generated-types-poc/" + mode + "/" + scenario + "/tsconfig.json";
	const argumentsList = ["--filter", benchmarkPackageName, ...tscArguments, "--project", project];
	const measuredSamples = Array.from({ length: samples }, () =>
		parseMetrics(runCommand(argumentsList)),
	);
	const generatedTypesPath = resolve(generatedRoot, mode, scenario, "src/generated-types.d.ts");
	const generatedDeclarationBytes =
		mode === "generated" ? readFileSync(generatedTypesPath).byteLength : undefined;

	return {
		mode,
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
		...(generatedDeclarationBytes === undefined ? {} : { generatedDeclarationBytes }),
	};
};

const loadTypeScriptVersion = (): string => {
	const output = runCommand(["--filter", benchmarkPackageName, "exec", "tsc", "--version"]);
	const match = output.match(/Version\s+([^\s]+)/);
	if (!match) throw new Error("Could not parse TypeScript version:\n" + output);
	return match[1];
};

const readSnapshot = (): Snapshot | undefined => {
	if (!existsSync(snapshotPath)) return undefined;
	return JSON.parse(readFileSync(snapshotPath, "utf8")) as Snapshot;
};

const buildSnapshot = (
	workloads: readonly WorkloadResult[],
	samples: number,
	typescript: string,
	previous: Snapshot | undefined,
): Snapshot => {
	const measuredKeys = new Set(
		workloads.map((workload) => workload.mode + ":" + workload.scenario),
	);
	const preservedWorkloads =
		previous?.workloads.filter(
			(workload) => !measuredKeys.has(workload.mode + ":" + workload.scenario),
		) ?? [];
	const allWorkloads = [...preservedWorkloads, ...workloads].toSorted(
		(left, right) =>
			left.scenario.localeCompare(right.scenario) || left.mode.localeCompare(right.mode),
	);
	const snapshotSamples =
		allWorkloads.length > 0 &&
		allWorkloads.every((workload) => workload.samples === allWorkloads[0].samples)
			? allWorkloads[0].samples
			: (previous?.samples ?? samples);
	return {
		schema: "pandwind.generated-types-poc/1",
		source: "runner/generated-types-poc.mts",
		updatedAt: new Date().toISOString().slice(0, 10),
		samples: snapshotSamples,
		environment: {
			platform: process.platform,
			arch: process.arch,
			node: process.version,
			typescript,
		},
		workloads: allWorkloads,
		tolerances: {
			instantiations: 0.1,
			memoryUsedKiB: 0.1,
			checkTimeSeconds: 0.5,
			totalTimeSeconds: 0.5,
			timingNoiseFloorSeconds: 0.05,
		},
	};
};

const assertNoRegression = (
	measured: readonly WorkloadResult[],
	previous: Snapshot,
	typescript: string,
): void => {
	if (previous.schema !== "pandwind.generated-types-poc/1") {
		throw new Error("Unsupported generated-types snapshot schema " + previous.schema);
	}
	if (previous.environment.typescript !== typescript) {
		throw new Error(
			"TypeScript version changed from " +
				previous.environment.typescript +
				" to " +
				typescript +
				"; run with --update to establish a new baseline",
		);
	}
	const previousByKey = new Map(
		previous.workloads.map((workload) => [workload.mode + ":" + workload.scenario, workload]),
	);
	const sameEnvironment =
		previous.environment.platform === process.platform &&
		previous.environment.arch === process.arch &&
		previous.environment.node === process.version;
	const failures: string[] = [];
	for (const workload of measured) {
		const baseline = previousByKey.get(workload.mode + ":" + workload.scenario);
		if (baseline === undefined) {
			throw new Error(
				"Missing baseline for " +
					workload.mode +
					":" +
					workload.scenario +
					"; run with --update first",
			);
		}
		const checks: Array<[keyof Metrics, number]> = [
			["instantiations", previous.tolerances.instantiations],
		];
		if (sameEnvironment && workload.samples === baseline.samples) {
			checks.push(
				["memoryUsedKiB", previous.tolerances.memoryUsedKiB],
				["checkTimeSeconds", previous.tolerances.checkTimeSeconds],
				["totalTimeSeconds", previous.tolerances.totalTimeSeconds],
			);
		}
		for (const [metric, tolerance] of checks) {
			const actual = workload.metrics[metric];
			const expected = baseline.metrics[metric];
			const timingNoiseFloor =
				metric === "checkTimeSeconds" || metric === "totalTimeSeconds"
					? previous.tolerances.timingNoiseFloorSeconds
					: 0;
			if (actual > Math.max(expected * (1 + tolerance), expected + timingNoiseFloor)) {
				failures.push(
					workload.mode +
						":" +
						workload.scenario +
						" " +
						metric +
						": " +
						String(actual) +
						" > " +
						String(expected) +
						" baseline + " +
						String(tolerance * 100) +
						"%",
				);
			}
		}
	}
	if (failures.length > 0) {
		throw new Error(
			"Generated-types POC regression detected:\n- " +
				failures.join("\n- ") +
				"\nUpdate intentionally with --update after reviewing the change.",
		);
	}
};

const formatMetric = (value: number, digits = 0): string =>
	digits === 0 ? String(Math.round(value)) : value.toFixed(digits);

const reduction = (inferred: number, generated: number): string => {
	if (inferred === 0) return "n/a";
	return ((1 - generated / inferred) * 100).toFixed(1) + "%";
};

const renderReport = (snapshot: Snapshot): string => {
	const byKey = new Map(
		snapshot.workloads.map((workload) => [workload.mode + ":" + workload.scenario, workload]),
	);
	const headers = ["Scenario", "Metric", "Inferred", "Generated", "Reduction"];
	const rows = scenarios.flatMap((scenario) => {
		const inferred = byKey.get("inferred:" + scenario);
		const generated = byKey.get("generated:" + scenario);
		if (inferred === undefined || generated === undefined) return [];
		const metrics: Array<[string, number, number, number]> = [
			["Instantiations", inferred.metrics.instantiations, generated.metrics.instantiations, 0],
			["Memory (KiB)", inferred.metrics.memoryUsedKiB, generated.metrics.memoryUsedKiB, 0],
			["Check (s)", inferred.metrics.checkTimeSeconds, generated.metrics.checkTimeSeconds, 3],
			["Total (s)", inferred.metrics.totalTimeSeconds, generated.metrics.totalTimeSeconds, 3],
		];
		return metrics.map(([metric, inferredValue, generatedValue, digits]) => [
			scenario,
			metric,
			formatMetric(inferredValue, digits),
			formatMetric(generatedValue, digits),
			reduction(inferredValue, generatedValue),
		]);
	});
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
		"# Generated Pandwind typing POC",
		"",
		"Generated by runner/generated-types-poc.mts and measured with " +
			snapshot.environment.typescript +
			". Each row records the median of fresh tsc processes.",
		"",
		"'inferred' calls the normal preset-aware createCss(preset) API.",
		"'generated' consumes a generated declaration facade with the same CssFn surface.",
		"",
		formatRow(headers, false),
		formatRow(separator, false),
		...rows.map((row) => formatRow(row, true)),
	];
	lines.push(
		"",
		"Generated declaration bytes:",
		"",
		...scenarios.flatMap((scenario) => {
			const generated = byKey.get("generated:" + scenario);
			return generated?.generatedDeclarationBytes === undefined
				? []
				: ["- " + scenario + ": " + String(generated.generatedDeclarationBytes)];
		}),
		"",
	);
	return lines.join("\n");
};

const printUsage = (): void => {
	console.log(
		[
			"Usage: pnpm run bench:tsc:generated -- [options]",
			"",
			"Options:",
			"  --update                  write the JSON and Markdown baseline",
			"  --samples N               fresh tsc processes per workload (default: 3)",
			"  --mode NAME               inferred or generated",
			"  --scenario NAME           minimal, medium, large, or huge",
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
	const selectedModes = options.mode === undefined ? modes : [options.mode];
	const selectedScenarios = options.scenario === undefined ? scenarios : [options.scenario];
	const typescript = loadTypeScriptVersion();
	generateFixtures();
	const workloads = selectedModes.flatMap((mode) =>
		selectedScenarios.map((scenario) => measureWorkload(mode, scenario, options.samples)),
	);
	const previous = readSnapshot();
	if (!options.update) {
		if (previous === undefined) {
			throw new Error("No generated-types POC snapshot exists; run with --update first");
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
