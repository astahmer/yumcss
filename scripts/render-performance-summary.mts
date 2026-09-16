import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
export const PERFORMANCE_SUMMARY = resolve(ROOT, "PERF.md");

type Metrics = {
	readonly files?: number;
	readonly instantiations: number;
	readonly memoryUsedKiB: number;
	readonly checkTimeSeconds: number;
	readonly totalTimeSeconds?: number;
};

type StylingWorkload = {
	readonly library: string;
	readonly scenario: "natural" | "stress";
	readonly metrics: Metrics;
};

type StylingSnapshot = {
	readonly updatedAt: string;
	readonly environment: { readonly typescript: string };
	readonly workloads: readonly StylingWorkload[];
};

type GeneratedWorkload = {
	readonly mode: "inferred" | "generated";
	readonly scenario: "minimal" | "medium" | "large" | "huge";
	readonly metrics: Metrics;
};

type GeneratedSnapshot = {
	readonly updatedAt: string;
	readonly environment: { readonly typescript: string };
	readonly workloads: readonly GeneratedWorkload[];
};

type TscSnapshot = {
	readonly updatedAt: string;
	readonly project: string;
	readonly metrics: Metrics;
};

type ApiTscSnapshot = {
	readonly updatedAt: string;
	readonly scenarios: readonly {
		readonly name: string;
		readonly category?: string;
		readonly description?: string;
		readonly metrics: Metrics;
	}[];
};

type RuntimeApiSnapshot = {
	readonly updatedAt: string;
	readonly samples: number;
	readonly environment: {
		readonly platform: string;
		readonly arch: string;
		readonly node: string;
	};
	readonly scenarios: readonly {
		readonly name: string;
		readonly category: string;
		readonly description: string;
		readonly iterations: number;
		readonly median: number;
		readonly p10: number;
		readonly p90: number;
	}[];
};

type BundleSize = { readonly min: number; readonly gz: number };

type RankingMetric = "checkTimeSeconds" | "instantiations";

const stylingSnapshotPath = resolve(ROOT, "benchmarks/styling-tsc/snapshots/tsc.json");
const generatedSnapshotPath = resolve(
	ROOT,
	"benchmarks/styling-tsc/snapshots/generated-types-poc.json",
);
const packageSnapshotPath = resolve(ROOT, "plans/evidence/pandwind-tsc.json");
const exampleSnapshotPath = resolve(ROOT, "plans/evidence/pandwind-example-tsc.json");
const apiSnapshotPath = resolve(ROOT, "packages/pandwind/tests/snapshots/tsc.json.snap");
const runtimeApiSnapshotPath = resolve(
	ROOT,
	"packages/pandwind/tests/snapshots/runtime-api-benchmark.json.snap",
);
const runtimeSizeSnapshotPath = resolve(
	ROOT,
	"packages/pandwind/tests/snapshots/runtime-size.json.snap",
);
const generatedRuntimeSizeSnapshotPath = resolve(
	ROOT,
	"packages/pandwind/tests/snapshots/generated-runtime-size.json.snap",
);

const readJson = <T,>(path: string): T | undefined => {
	if (!existsSync(path)) return undefined;
	return JSON.parse(readFileSync(path, "utf8")) as T;
};

const integer = (value: number): string => Math.round(value).toLocaleString("en-US");
const seconds = (value: number): string => value.toFixed(3);
const kilobytes = (value: number): string => (Math.round(value / 10) / 100).toFixed(2);

const reduction = (from: number, to: number): string =>
	from === 0 ? "n/a" : `${((1 - to / from) * 100).toFixed(1)}%`;

const markdownTable = (
	headers: readonly string[],
	rows: readonly (readonly string[])[],
	numericColumns: ReadonlySet<number>,
): string => {
	const widths = headers.map((header, index) =>
		Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)),
	);
	const formatRow = (row: readonly string[]): string =>
		`| ${row
			.map((value, index) =>
				numericColumns.has(index) ? value.padStart(widths[index]!) : value.padEnd(widths[index]!),
			)
			.join(" | ")} |`;
	const separator = widths.map((width, index) =>
		numericColumns.has(index)
			? `${"-".repeat(Math.max(2, width - 1))}:`
			: "-".repeat(Math.max(3, width)),
	);
	return [formatRow(headers), formatRow(separator), ...rows.map(formatRow)].join("\n");
};

const displayLibrary = (library: string): string => {
	if (library === "pandwind") return "pandwind (inferred)";
	if (library === "pandwind-generated") return "pandwind (generated)";
	return library;
};

const renderRanking = (
	snapshot: StylingSnapshot,
	scenario: StylingWorkload["scenario"],
	metric: RankingMetric,
): string => {
	const workloads = snapshot.workloads
		.filter((workload) => workload.scenario === scenario)
		.toSorted(
			(left, right) =>
				left.metrics[metric] - right.metrics[metric] || left.library.localeCompare(right.library),
		);
	const rows = workloads.map((workload, index) =>
		metric === "checkTimeSeconds"
			? [
					String(index + 1),
					displayLibrary(workload.library),
					seconds(workload.metrics.checkTimeSeconds),
					integer(workload.metrics.instantiations),
					integer(workload.metrics.memoryUsedKiB),
				]
			: [
					String(index + 1),
					displayLibrary(workload.library),
					integer(workload.metrics.instantiations),
					integer(workload.metrics.memoryUsedKiB),
				],
	);
	return metric === "checkTimeSeconds"
		? markdownTable(
				["Rank", "Library", "Check (s)", "Instantiations", "Memory (KiB)"],
				rows,
				new Set([0, 2, 3, 4]),
			)
		: markdownTable(
				["Rank", "Library", "Instantiations", "Memory (KiB)"],
				rows,
				new Set([0, 2, 3]),
			);
};

const renderPandwindBaselines = (
	packageSnapshot: TscSnapshot | undefined,
	exampleSnapshot: TscSnapshot | undefined,
	apiSnapshot: ApiTscSnapshot | undefined,
): string[] => {
	const rows: string[][] = [];
	const add = (label: string, snapshot: TscSnapshot | undefined): void => {
		if (snapshot === undefined) return;
		rows.push([
			label,
			integer(snapshot.metrics.instantiations),
			integer(snapshot.metrics.memoryUsedKiB),
			seconds(snapshot.metrics.checkTimeSeconds),
		]);
	};
	add("package", packageSnapshot);
	add("example app", exampleSnapshot);
	if (apiSnapshot !== undefined) {
		for (const name of [
			"css.real-world.usage",
			"app",
			"css.dynamic",
			"css.generated",
			"css.unsafe",
			"dss",
			"css.runtime",
			"cx",
			"tw",
		]) {
			const scenario = apiSnapshot.scenarios.find((candidate) => candidate.name === name);
			if (scenario === undefined) continue;
			rows.push([
				`API ${name}`,
				integer(scenario.metrics.instantiations),
				integer(scenario.metrics.memoryUsedKiB),
				seconds(scenario.metrics.checkTimeSeconds),
			]);
		}
	}
	if (rows.length === 0) return [];
	return [
		"## Pandwind typecheck baselines",
		"",
		"These are the repo-owned package, example-app, and public-API records.",
		"",
		markdownTable(
			["Workload", "Instantiations", "Memory (KiB)", "Check (s)"],
			rows,
			new Set([1, 2, 3]),
		),
		"",
	];
};

const renderPandwindApiRanking = (snapshot: ApiTscSnapshot | undefined): string[] => {
	if (snapshot === undefined || snapshot.scenarios.length === 0) return [];
	const table = (metric: "checkTimeSeconds" | "instantiations"): string => {
		const scenarios = snapshot.scenarios.toSorted(
			(left, right) =>
				left.metrics[metric] - right.metrics[metric] ||
				left.metrics.memoryUsedKiB - right.metrics.memoryUsedKiB ||
				left.name.localeCompare(right.name),
		);
		const rows = scenarios.map((scenario, index) =>
			metric === "checkTimeSeconds"
				? [
						String(index + 1),
						scenario.name,
						scenario.category ?? "api",
						seconds(scenario.metrics.checkTimeSeconds),
						integer(scenario.metrics.instantiations),
						integer(scenario.metrics.memoryUsedKiB),
					]
				: [
						String(index + 1),
						scenario.name,
						scenario.category ?? "api",
						integer(scenario.metrics.instantiations),
						integer(scenario.metrics.memoryUsedKiB),
						seconds(scenario.metrics.checkTimeSeconds),
					],
		);
		return metric === "checkTimeSeconds"
			? markdownTable(
					["Rank", "API", "Category", "Check (s)", "Instantiations", "Memory (KiB)"],
					rows,
					new Set([0, 3, 4, 5]),
				)
			: markdownTable(
					["Rank", "API", "Category", "Instantiations", "Memory (KiB)", "Check (s)"],
					rows,
					new Set([0, 3, 4, 5]),
				);
	};
	return [
		"## Pandwind API typecheck ranking",
		"",
		"Every first-class API lane has its own fresh-process row; lower is better. The package and app baselines above are kept separate because they include repository context beyond one API fixture.",
		"",
		"### By check time",
		"",
		table("checkTimeSeconds"),
		"",
		"### By type instantiations",
		"",
		table("instantiations"),
		"",
	];
};

const renderGeneratedComparison = (snapshot: GeneratedSnapshot | undefined): string[] => {
	if (snapshot === undefined) return [];
	const byKey = new Map(
		snapshot.workloads.map((workload) => [workload.mode + ":" + workload.scenario, workload]),
	);
	const rows = (["minimal", "medium", "large", "huge"] as const).flatMap((scenario) => {
		const inferred = byKey.get("inferred:" + scenario);
		const generated = byKey.get("generated:" + scenario);
		if (inferred === undefined || generated === undefined) return [];
		return [
			[
				scenario,
				integer(inferred.metrics.instantiations),
				integer(generated.metrics.instantiations),
				reduction(inferred.metrics.instantiations, generated.metrics.instantiations),
				seconds(inferred.metrics.checkTimeSeconds),
				seconds(generated.metrics.checkTimeSeconds),
			],
		];
	});
	if (rows.length === 0) return [];
	return [
		"## Generated facade result",
		"",
		"The generated lane is the same public CssFn workload with preset-derived unions materialized ahead of consumer typechecking.",
		"",
		markdownTable(
			[
				"Scenario",
				"Inferred instantiations",
				"Generated instantiations",
				"Reduction",
				"Inferred check (s)",
				"Generated check (s)",
			],
			rows,
			new Set([1, 2, 4, 5]),
		),
		"",
		"Full paired measurements: [generated-types-poc.md](benchmarks/styling-tsc/snapshots/generated-types-poc.md).",
		"",
	];
};

const sizeKind = (name: string): string => {
	if (name.includes("static output")) return "static output";
	if (name === "stylesheet generator (build-time only)") return "build-time only";
	if (name.includes("compiler-pruned")) return "compiler-pruned";
	if (name.startsWith("createCssRuntime")) return "internal core";
	if (name.startsWith("createCss(preset)")) return "preset-bound fallback";
	if (name.startsWith("createRuntimeCss")) return "live sheet";
	if (name.includes("generated")) return "generated runtime";
	if (name.startsWith("createUnsafeCss")) return "unsafe fallback";
	if (name.startsWith("root barrel")) return "tree-shaken barrel";
	if (name.startsWith("unsafe css subpath")) return "tree-shaken subpath";
	return "runtime";
};

const renderBundleRanking = (sizes: Record<string, BundleSize> | undefined): string[] => {
	if (sizes === undefined) return [];
	const rows = Object.entries(sizes)
		.toSorted(
			([leftName, left], [rightName, right]) =>
				left.gz - right.gz || left.min - right.min || leftName.localeCompare(rightName),
		)
		.map(([name, size], index) => [
			String(index + 1),
			name,
			sizeKind(name),
			kilobytes(size.min),
			kilobytes(size.gz),
		]);
	return [
		"## Runtime size ranking",
		"",
		"Lower is smaller. Sizes are decimal KB (1 KB = 1,000 bytes); exact byte values remain in the committed snapshot and budgets. Static output and build-time-only rows are included for completeness but are not browser runtime costs.",
		"",
		markdownTable(
			["Rank", "Entry", "Kind", "Minified (KB)", "Gzip (KB)"],
			rows,
			new Set([0, 3, 4]),
		),
		"",
	];
};

const renderGeneratedRuntimeSizes = (sizes: Record<string, BundleSize> | undefined): string[] => {
	if (sizes === undefined) return [];
	const rows = Object.entries(sizes)
		.toSorted(
			([leftName, left], [rightName, right]) =>
				left.gz - right.gz || leftName.localeCompare(rightName),
		)
		.map(([name, size], index) => [
			String(index + 1),
			name,
			kilobytes(size.min),
			kilobytes(size.gz),
		]);
	return [
		"## Generated Tailwind metadata size",
		"",
		"These rows are separate from the native CSS runtime: static generated calls erase the metadata, while dynamic generated tw/cx calls intentionally retain it. Sizes use decimal KB; exact byte values remain in the committed snapshot.",
		"",
		markdownTable(["Rank", "Entry", "Minified (KB)", "Gzip (KB)"], rows, new Set([0, 2, 3])),
		"",
	];
};

const renderRuntimeApiRanking = (snapshot: RuntimeApiSnapshot | undefined): string[] => {
	if (snapshot === undefined || snapshot.scenarios.length === 0) return [];
	const rows = snapshot.scenarios
		.toSorted(
			(left, right) =>
				right.median - left.median ||
				left.category.localeCompare(right.category) ||
				left.name.localeCompare(right.name),
		)
		.map((scenario, index) => [
			String(index + 1),
			scenario.name,
			scenario.category,
			integer(scenario.median),
			integer(scenario.p10),
			integer(scenario.p90),
		]);
	return [
		"## Pandwind runtime API throughput ranking",
		"",
		`Measured on ${snapshot.environment.platform}/${snapshot.environment.arch} with Node ${snapshot.environment.node}; snapshot updated ${snapshot.updatedAt}. Higher is better, but rows are different operations and are not a single composite score. Build-category rows measure supporting tooling and are not browser runtime costs.`,
		"",
		markdownTable(
			["Rank", "API", "Category", "Median ops/s", "P10 ops/s", "P90 ops/s"],
			rows,
			new Set([0, 3, 4, 5]),
		),
		"",
		"The dedicated runtime snapshot is [runtime-api-benchmark.json.snap](packages/pandwind/tests/snapshots/runtime-api-benchmark.json.snap); the older hot-path regression snapshot remains separate because its repeated micro-inputs and tolerance are intentionally different.",
		"",
	];
};

export const renderPerformanceSummary = (): string => {
	const styling = readJson<StylingSnapshot>(stylingSnapshotPath);
	const generated = readJson<GeneratedSnapshot>(generatedSnapshotPath);
	const packageSnapshot = readJson<TscSnapshot>(packageSnapshotPath);
	const exampleSnapshot = readJson<TscSnapshot>(exampleSnapshotPath);
	const apiSnapshot = readJson<ApiTscSnapshot>(apiSnapshotPath);
	const runtimeApiSnapshot = readJson<RuntimeApiSnapshot>(runtimeApiSnapshotPath);
	const runtimeSizes = readJson<Record<string, BundleSize>>(runtimeSizeSnapshotPath);
	const generatedRuntimeSizes = readJson<Record<string, BundleSize>>(
		generatedRuntimeSizeSnapshotPath,
	);
	const lines = [
		"<!-- Generated by scripts/render-performance-summary.mts; do not edit. -->",
		"",
		"# Pandwind performance summary",
		"",
		"This compact report is derived from the committed typecheck, runtime-throughput, and bundle-size snapshots. Lower is better for typecheck/size; higher is better for throughput. Rankings are per workload and metric, not a universal library score.",
		"",
		"TypeScript measurements use fresh processes and the pinned TypeScript version in each benchmark. Runtime-throughput measurements are local in-process calls. Runtime-size measurements are minified browser bundles with gzip level 6.",
		"",
		...renderPandwindBaselines(packageSnapshot, exampleSnapshot, apiSnapshot),
		...renderPandwindApiRanking(apiSnapshot),
	];
	if (styling !== undefined) {
		lines.push(
			"## Ecosystem typecheck ranking — stress workload",
			"",
			`Measured with TypeScript ${styling.environment.typescript}; snapshot updated ${styling.updatedAt}. The full natural/stress table is [tsc.md](benchmarks/styling-tsc/snapshots/tsc.md).`,
			"",
			"### By check time",
			"",
			renderRanking(styling, "stress", "checkTimeSeconds"),
			"",
			"### By type instantiations",
			"",
			renderRanking(styling, "stress", "instantiations"),
			"",
		);
	}
	lines.push(...renderGeneratedComparison(generated));
	lines.push(...renderRuntimeApiRanking(runtimeApiSnapshot));
	lines.push(...renderBundleRanking(runtimeSizes));
	lines.push(...renderGeneratedRuntimeSizes(generatedRuntimeSizes));
	lines.push(
		"## Sources and refresh commands",
		"",
		"- Typecheck ecosystem: `pnpm run bench:tsc:styling -- --update`",
		"- Generated facade comparison: `pnpm run bench:tsc:generated -- --update`",
		"- Package/example typecheck: `pnpm run bench:tsc -- --update` and `pnpm run bench:tsc:example -- --update`",
		"- Public API typecheck: `pnpm --filter pandwind run test:tsc -- -u`",
		"- Runtime size: `pnpm --filter pandwind exec vitest run runtime-size -u`",
		"- Runtime API throughput: `pnpm --filter pandwind run test:benchmarks -- -u`",
		"- Summary freshness: `pnpm run bench:summary:check`",
		"",
	);
	return lines.join("\n");
};

export const writePerformanceSummary = (): void => {
	writeFileSync(PERFORMANCE_SUMMARY, renderPerformanceSummary());
};

const checkPerformanceSummary = (): void => {
	if (!existsSync(PERFORMANCE_SUMMARY)) {
		throw new Error(`missing ${PERFORMANCE_SUMMARY}; run pnpm run bench:summary`);
	}
	const expected = renderPerformanceSummary();
	const actual = readFileSync(PERFORMANCE_SUMMARY, "utf8");
	if (actual !== expected) {
		throw new Error("PERF.md is stale; run pnpm run bench:summary");
	}
};

const main = (): void => {
	if (process.argv.includes("--check")) {
		checkPerformanceSummary();
		return;
	}
	writePerformanceSummary();
};

if (process.argv[1] === import.meta.filename) main();
