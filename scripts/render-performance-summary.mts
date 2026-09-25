import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
export const PERFORMANCE_SUMMARY = resolve(ROOT, "PERF.md");
export const PERFORMANCE_OVERVIEW = resolve(ROOT, "PERF-SUMMARY.md");

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

type EcosystemBundleSnapshot = {
	readonly updatedAt: string;
	readonly samples: number;
	readonly environment: {
		readonly platform: string;
		readonly arch: string;
		readonly node: string;
		readonly vite: string;
		readonly esbuild: string;
	};
	readonly workloads: readonly {
		readonly library: string;
		readonly category: "static" | "runtime";
		readonly buildMode: string;
		readonly cssDelivery: "extracted" | "injected" | "none";
		readonly arbitraryRuntimeValues: boolean;
		readonly delta: {
			readonly js: BundleSize;
			readonly css: BundleSize;
			readonly total: BundleSize;
		};
	}[];
};

type ExternalBenchmarkResult = {
	readonly tech: string;
	readonly label: string;
	readonly value: number;
	readonly spread?: number;
	readonly p95Ms?: number;
	readonly payload?: {
		readonly js: number;
		readonly css: number;
		readonly html: number;
	};
};

type ExternalBenchmarkWorkload = {
	readonly id: string;
	readonly label: string;
	readonly unit: string;
	readonly direction: "higher" | "lower";
	readonly caseId: string;
	readonly results: readonly ExternalBenchmarkResult[];
	readonly bonusResults: readonly ExternalBenchmarkResult[];
	readonly strategyResults: readonly ExternalBenchmarkResult[];
};

type CssInJsBenchSnapshot = {
	readonly schemaVersion: 2;
	readonly source: {
		readonly repository: string;
		readonly url: string;
		readonly cssInJsBenchRevision: string;
		readonly pandwindRevision: string;
		readonly pandwindMainLane: string;
		readonly pandwindTwBonusLane: string;
		readonly pandwindNamedStrategyDiagnostic: string;
		readonly wpdCompletedAt: string;
		readonly host: string;
		readonly node: string;
		readonly gitSha: string;
		readonly wpdVersion: string;
		readonly browsers: { readonly chrome?: string; readonly firefox?: string };
		readonly laneCount: number;
		readonly caseCount: number;
		readonly pandwindBuildtimeSamples?: {
			readonly coldMs: readonly number[];
			readonly warmMs: readonly number[];
		};
	};
	readonly workloads: readonly ExternalBenchmarkWorkload[];
};

type ArenaLibrary = "bamboo" | "stylex" | "panda" | "pandwind";

type ArenaMetric = {
	readonly category: string;
	readonly label: string;
	readonly unit: "B" | "ms";
	readonly values: Readonly<Record<ArenaLibrary, number>>;
};

type ArenaParity = {
	readonly geometryPassed: number;
	readonly geometryTotal: number;
	readonly geometryThresholdPx: number;
	readonly screenshotsPassed: number;
	readonly screenshotsTotal: number;
	readonly screenshotThresholdPercent: number;
	readonly pandwindMaxImageDifferencePercent: number;
	readonly maxImageDifferencePercent: number;
};

type ArenaOutputVerification = {
	readonly pandwindRevision: string;
	readonly measuredAt: string;
	readonly environment: string;
	readonly parity: Pick<
		ArenaParity,
		| "geometryPassed"
		| "geometryTotal"
		| "geometryThresholdPx"
		| "screenshotsPassed"
		| "screenshotsTotal"
		| "screenshotThresholdPercent"
	>;
	readonly metrics: readonly {
		readonly label: string;
		readonly unit: "B";
		readonly value: number;
	}[];
};

type ArenaSnapshot = {
	readonly schemaVersion: 1;
	readonly source: {
		readonly url: string;
		readonly arenaRevision: string;
		readonly pandwindRevision: string;
		readonly measuredAt: string;
		readonly environment: string;
		readonly parity: ArenaParity;
	};
	readonly metrics: readonly ArenaMetric[];
	readonly outputVerification?: ArenaOutputVerification;
};

type RealWorldBuildSamples = {
	readonly moduleCount: number;
	readonly beforeBuildSeconds: readonly number[];
	readonly afterBuildSeconds: readonly number[];
};

type RealWorldAssetSizes = {
	readonly files: number;
	readonly rawBytes: number;
	readonly gzip9Bytes: number;
	readonly brotli11Bytes: number;
};

type RealWorldCssExtractionSnapshot = {
	readonly schemaVersion: 1;
	readonly measuredAt: string;
	readonly environment: {
		readonly machine: string;
		readonly node: string;
		readonly vite: string;
	};
	readonly source: {
		readonly emisoupRevision: string;
		readonly pandwindBeforeRevision: string;
		readonly pandwindAfterRevision: string;
	};
	readonly currentBuildRecheck?: {
		readonly measuredAt: string;
		readonly source: {
			readonly emisoupRevision: string;
			readonly pandwindRevision: string;
		};
		readonly environment: {
			readonly machine: string;
			readonly node: string;
			readonly emisoupVite: string;
			readonly playgroundVite: string;
		};
		readonly processTreeRssSampleIntervalMs: number;
		readonly emisoup: {
			readonly command: string;
			readonly buildWallSeconds: readonly number[];
			readonly peakProcessTreeRssMiB: readonly number[];
		};
		readonly playground: {
			readonly command: string;
			readonly buildWallSeconds: readonly number[];
			readonly peakProcessTreeRssMiB: readonly number[];
		};
	};
	readonly emisoup: RealWorldBuildSamples & {
		readonly afterMaxResidentBytes: readonly number[];
	};
	readonly playground: RealWorldBuildSamples;
	readonly sourceScan: {
		readonly files: number;
		readonly parserCallsBefore: number;
		readonly parserCallsAfter: number;
		readonly parseAndWalkSamplesMs: readonly number[];
		readonly guardedScanSamplesMs: readonly number[];
	};
	readonly cpuProfiles: {
		readonly beforeSampledSelfMs: number;
		readonly beforeAstWalkSelfMs: number;
		readonly afterSampledSelfMs: number;
		readonly afterAstWalkSelfMs: number;
	};
	readonly instrumentedHooks: {
		readonly buildSeconds: number;
		readonly stackFoldTransformCalls: number;
		readonly stackFoldTransformInclusiveMs: number;
		readonly cssTransformCalls: number;
		readonly cssTransformInclusiveMs: number;
		readonly cssTransformMaxMs: number;
		readonly cssGenerateBundleCalls: number;
		readonly cssGenerateBundleMs: number;
	};
	readonly clientAssets: {
		readonly html: RealWorldAssetSizes;
		readonly javascript: RealWorldAssetSizes;
		readonly css: RealWorldAssetSizes;
		readonly total: RealWorldAssetSizes;
		readonly mainPandwindStylesheet: {
			readonly rawBytes: number;
			readonly gzip9Bytes: number;
			readonly brotli11Bytes: number;
			readonly ruleCount: number;
			readonly duplicateBodyGroups: number;
			readonly duplicateRuleCount: number;
			readonly repeatedDeclarationBytes: number;
			readonly adjacentRulesMerged: number;
			readonly adjacentMergeRawBytesSaved: number;
			readonly adjacentMergeGzip9BytesSaved: number;
			readonly adjacentMergeBrotli11BytesSaved: number;
			readonly progressFillTransitionRuleCount: number;
			readonly progressFillWidthVariableRuleCount: number;
			readonly progressFillAuthoredTokenPathPresent: boolean;
			readonly progressFillRuntimeValues: readonly string[];
			readonly progressFillRuntimeClassStable: boolean;
		};
	};
};

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
const ecosystemBundleSizeSnapshotPath = resolve(
	ROOT,
	"benchmarks/styling-size/snapshots/bundle-size.json",
);
const cssInJsBenchSnapshotPath = resolve(ROOT, "benchmarks/css-in-js-bench/snapshot.json");
const arenaSnapshotPath = resolve(ROOT, "benchmarks/css-in-js-arena/snapshot.json");
const realWorldCssExtractionSnapshotPath = resolve(
	ROOT,
	"benchmarks/real-world-css-extraction/snapshot.json",
);

const readJson = <T,>(path: string): T | undefined => {
	if (!existsSync(path)) return undefined;
	return JSON.parse(readFileSync(path, "utf8")) as T;
};

const integer = (value: number): string => Math.round(value).toLocaleString("en-US");
const seconds = (value: number): string => value.toFixed(3);
const kilobytes = (value: number): string => (Math.round(value / 10) / 100).toFixed(2);
const median = (values: readonly number[]): number => {
	const sorted = values.toSorted((left, right) => left - right);
	return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

const signedKilobytes = (value: number): string => {
	if (value === 0) return "0.00 KB";
	return `${value < 0 ? "-" : "+"}${kilobytes(Math.abs(value))} KB`;
};

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

const arenaLibraries: readonly { readonly id: ArenaLibrary; readonly label: string }[] = [
	{ id: "bamboo", label: "Bamboo" },
	{ id: "stylex", label: "StyleX" },
	{ id: "panda", label: "Panda" },
	{ id: "pandwind", label: "Pandwind" },
];

const formatArenaValue = (value: number, unit: ArenaMetric["unit"]): string =>
	`${value.toLocaleString("en-US", { maximumFractionDigits: unit === "ms" ? 1 : 0 })} ${unit}`;

const renderArenaComparison = (snapshot: ArenaSnapshot | undefined): string[] => {
	if (snapshot === undefined) {
		throw new Error(`missing ${arenaSnapshotPath}; refresh the CSS-in-JS Arena comparison first`);
	}
	const { parity } = snapshot.source;
	const rows = snapshot.metrics.map((metric) => {
		const ranked = arenaLibraries
			.map((library) => ({ ...library, value: metric.values[library.id] }))
			.toSorted((left, right) => left.value - right.value || left.label.localeCompare(right.label));
		const topThree = ranked
			.slice(0, 3)
			.map(
				(entry, index) =>
					`${index + 1}. ${entry.label} (${formatArenaValue(entry.value, metric.unit)})`,
			)
			.join("<br>");
		const pandwindIndex = ranked.findIndex((entry) => entry.id === "pandwind");
		const pandwind = ranked[pandwindIndex]!;
		return [
			metric.category,
			metric.label,
			topThree,
			`#${pandwindIndex + 1}/4 — ${formatArenaValue(pandwind.value, metric.unit)}`,
		];
	});
	return [
		"## [CSS-in-JS Arena](https://github.com/gajus/css-in-js-arena) six-page comparison",
		"",
		`Pandwind's six-page lane passed parity: ${parity.geometryPassed}/${parity.geometryTotal} route geometry checks stayed within ${parity.geometryThresholdPx} px; ${parity.screenshotsPassed}/${parity.screenshotsTotal} screenshots stayed below ${parity.screenshotThresholdPercent}%. Measured ${snapshot.source.measuredAt} on ${snapshot.source.environment}. Lower is better; each row ranks the four engines independently, with no combined score.`,
		"",
		markdownTable(["Category", "Measure", "Top three", "Pandwind"], rows, new Set()),
		"",
		`Pandwind's maximum screenshot difference was ${parity.pandwindMaxImageDifferencePercent}%; maximum across all lanes was ${parity.maxImageDifferencePercent}%. The Arena worktree records full methods and stress results in revision ${snapshot.source.arenaRevision}; normalized inputs are in the [local comparison snapshot](benchmarks/css-in-js-arena/snapshot.json). Pandwind source revision ${snapshot.source.pandwindRevision}.`,
		"",
		...renderArenaOutputVerificationOverview(snapshot),
	];
};

const renderArenaOutputVerificationOverview = (snapshot: ArenaSnapshot): string[] => {
	const verification = snapshot.outputVerification;
	if (verification === undefined) return [];
	const javascript = verification.metrics.find(({ label }) => label === "Client JavaScript, Brotli");
	const fullFirstLoad = verification.metrics.find(({ label }) => label === "Full first load");
	const pinnedJavascript = snapshot.metrics.find(({ label }) => label === "Client JavaScript, Brotli");
	const pinnedFullFirstLoad = snapshot.metrics.find(({ label }) => label === "Full first load");
	if (
		javascript === undefined ||
		fullFirstLoad === undefined ||
		pinnedJavascript === undefined ||
		pinnedFullFirstLoad === undefined
	) {
		throw new Error("Arena output verification is missing required transfer metrics");
	}
	const javascriptDelta = javascript.value - pinnedJavascript.values.pandwind;
	const fullFirstLoadDelta = fullFirstLoad.value - pinnedFullFirstLoad.values.pandwind;
	const parity = verification.parity;
	return [
		"Current-source output recheck: Pandwind revision " +
			verification.pandwindRevision +
			" measured " +
			verification.measuredAt +
			" on " +
			verification.environment +
			" passed " +
			parity.geometryPassed +
			"/" +
			parity.geometryTotal +
			" geometry checks and " +
			parity.screenshotsPassed +
			"/" +
			parity.screenshotsTotal +
			" screenshot checks. All rechecked output ranks stayed the same; JavaScript Brotli changed by " +
			(javascriptDelta > 0 ? "+" : "") +
			javascriptDelta +
			" B and full first load by " +
			(fullFirstLoadDelta > 0 ? "+" : "") +
			fullFirstLoadDelta +
			" B versus the pinned ranking snapshot.",
		"",
	];
};

const renderArenaOutputVerificationDetails = (snapshot: ArenaSnapshot): string[] => {
	const verification = snapshot.outputVerification;
	if (verification === undefined) return [];
	const rows = verification.metrics.map((metric) => {
		const pinnedMetric = snapshot.metrics.find(({ label }) => label === metric.label);
		if (pinnedMetric === undefined) {
			throw new Error("Arena output verification metric is missing from the pinned snapshot: " + metric.label);
		}
		const ranked = arenaLibraries
			.map((library) => ({
				...library,
				value: library.id === "pandwind" ? metric.value : pinnedMetric.values[library.id],
			}))
			.toSorted((left, right) => left.value - right.value || left.label.localeCompare(right.label));
		const rank = ranked.findIndex(({ id }) => id === "pandwind") + 1;
		const delta = metric.value - pinnedMetric.values.pandwind;
		return [
			metric.label,
			formatArenaValue(pinnedMetric.values.pandwind, metric.unit),
			formatArenaValue(metric.value, metric.unit),
			(delta > 0 ? "+" : "") + delta + " B",
			"#" + rank + "/4",
		];
	});
	const parity = verification.parity;
	return [
		"### Current-source output recheck",
		"",
		"Pandwind revision " +
			verification.pandwindRevision +
			" measured " +
			verification.measuredAt +
			" on " +
			verification.environment +
			". Geometry passed " +
			parity.geometryPassed +
			"/" +
			parity.geometryTotal +
			" checks within " +
			parity.geometryThresholdPx +
			" px; screenshots passed " +
			parity.screenshotsPassed +
			"/" +
			parity.screenshotsTotal +
			" checks under " +
			parity.screenshotThresholdPercent +
			"%. Rankings use the pinned peer values, with the current Pandwind output substituted.",
		"",
		markdownTable(
			["Output measure", "Pinned Pandwind", "Current Pandwind", "Delta", "Rank"],
			rows,
			new Set([1, 2, 3, 4]),
		),
		"",
	];
};

const renderArenaDetails = (snapshot: ArenaSnapshot | undefined): string[] => {
	if (snapshot === undefined) return [];
	const { parity } = snapshot.source;
	const rows = snapshot.metrics.map((metric) => {
		const ranked = arenaLibraries
			.map((library) => ({ ...library, value: metric.values[library.id] }))
			.toSorted((left, right) => left.value - right.value || left.label.localeCompare(right.label));
		return [
			metric.category,
			metric.label,
			...ranked.map(
				(entry, index) =>
					`${index + 1}. ${entry.label}: ${formatArenaValue(entry.value, metric.unit)}`,
			),
		];
	});
	return [
		"## CSS-in-JS Arena detailed results",
		"",
		`Source revisions: Arena ${snapshot.source.arenaRevision}, Pandwind ${snapshot.source.pandwindRevision}. Measured ${snapshot.source.measuredAt} on ${snapshot.source.environment}. Geometry passed ${parity.geometryPassed}/${parity.geometryTotal} route checks within ${parity.geometryThresholdPx} px; screenshots passed ${parity.screenshotsPassed}/${parity.screenshotsTotal} within ${parity.screenshotThresholdPercent}%. Maximum screenshot difference: Pandwind ${parity.pandwindMaxImageDifferencePercent}%, all lanes ${parity.maxImageDifferencePercent}%. Each metric is ranked independently, lower is better, and there is no composite score.`,
		"",
		markdownTable(["Category", "Measure", "Rank 1", "Rank 2", "Rank 3", "Rank 4"], rows, new Set()),
		"",
		`Full normalized measurements and parity metadata: [snapshot.json](benchmarks/css-in-js-arena/snapshot.json).`,
		"",
		...renderArenaOutputVerificationDetails(snapshot),
	];
};

const formatBuildWallSamples = (samples: readonly number[]): string =>
	"median " +
	median(samples).toFixed(2) +
	" s, range " +
	Math.min(...samples).toFixed(2) +
	"–" +
	Math.max(...samples).toFixed(2) +
	" s (" +
	samples.map((value) => value.toFixed(2)).join(", ") +
	")";

const formatProcessTreeRssSamples = (samples: readonly number[]): string =>
	"median " +
	median(samples).toFixed(0) +
	" MiB, range " +
	Math.min(...samples).toFixed(0) +
	"–" +
	Math.max(...samples).toFixed(0) +
	" MiB (" +
	samples.map((value) => value.toFixed(0)).join(", ") +
	")";

const renderRealWorldCssExtractionDetails = (
	snapshot: RealWorldCssExtractionSnapshot,
): string[] => {
	const appBeforeMedian = median(snapshot.emisoup.beforeBuildSeconds);
	const appAfterMedian = median(snapshot.emisoup.afterBuildSeconds);
	const playgroundBeforeMedian = median(snapshot.playground.beforeBuildSeconds);
	const playgroundAfterMedian = median(snapshot.playground.afterBuildSeconds);
	const sourceScanBeforeMedian = median(snapshot.sourceScan.parseAndWalkSamplesMs);
	const sourceScanAfterMedian = median(snapshot.sourceScan.guardedScanSamplesMs);
	const sourceScanImprovement = sourceScanBeforeMedian / sourceScanAfterMedian;
	const assetRows = [
		[
			"HTML",
			String(snapshot.clientAssets.html.files),
			integer(snapshot.clientAssets.html.rawBytes),
			integer(snapshot.clientAssets.html.gzip9Bytes),
			integer(snapshot.clientAssets.html.brotli11Bytes),
		],
		[
			"JavaScript",
			String(snapshot.clientAssets.javascript.files),
			integer(snapshot.clientAssets.javascript.rawBytes),
			integer(snapshot.clientAssets.javascript.gzip9Bytes),
			integer(snapshot.clientAssets.javascript.brotli11Bytes),
		],
		[
			"CSS",
			String(snapshot.clientAssets.css.files),
			integer(snapshot.clientAssets.css.rawBytes),
			integer(snapshot.clientAssets.css.gzip9Bytes),
			integer(snapshot.clientAssets.css.brotli11Bytes),
		],
		[
			"Total",
			String(snapshot.clientAssets.total.files),
			integer(snapshot.clientAssets.total.rawBytes),
			integer(snapshot.clientAssets.total.gzip9Bytes),
			integer(snapshot.clientAssets.total.brotli11Bytes),
		],
	];
	const css = snapshot.clientAssets.mainPandwindStylesheet;
	const memoryValues = snapshot.emisoup.afterMaxResidentBytes.map((value) =>
		(value / 1_000_000_000).toFixed(2),
	);
	const recheck = snapshot.currentBuildRecheck;
	const currentBuildDetails =
		recheck === undefined
			? []
			: [
					"### Current-source build and memory recheck",
					"",
					"Measured " +
						recheck.measuredAt +
						" with Emisoup source " +
						recheck.source.emisoupRevision +
						", Pandwind source " +
						recheck.source.pandwindRevision +
						", and Node " +
						recheck.environment.node +
						". Vite versions: Emisoup " +
						recheck.environment.emisoupVite +
						", Playground " +
						recheck.environment.playgroundVite +
						".",
					"",
					markdownTable(
						["Workload", "Full command", "Wall samples", "Peak process-tree RSS"],
						[
							[
								"Emisoup",
								"`" + recheck.emisoup.command + "`",
								formatBuildWallSamples(recheck.emisoup.buildWallSeconds),
								formatProcessTreeRssSamples(recheck.emisoup.peakProcessTreeRssMiB),
							],
							[
								"Playground",
								"`" + recheck.playground.command + "`",
								formatBuildWallSamples(recheck.playground.buildWallSeconds),
								formatProcessTreeRssSamples(recheck.playground.peakProcessTreeRssMiB),
							],
						],
						new Set(),
					),
					"",
					"Peak resident memory is the sampled sum for pnpm and descendant processes, polled every " +
						recheck.processTreeRssSampleIntervalMs +
						" ms. These current full-build samples characterize run-to-run spread; the pinned before/after comparison remains the source for optimization claims.",
					"",
				];
	return [
		"## Real-world Vite extraction: Emisoup and Playground",
		"",
		"Measured " +
			snapshot.measuredAt +
			" on " +
			snapshot.environment.machine +
			", Node " +
			snapshot.environment.node +
			", Vite " +
			snapshot.environment.vite +
			". Emisoup source " +
			snapshot.source.emisoupRevision +
			"; Pandwind before scan gate " +
			snapshot.source.pandwindBeforeRevision +
			"; after " +
			snapshot.source.pandwindAfterRevision +
			".",
		"",
		markdownTable(
			["Workload", "Modules", "Before runs (s)", "Before median", "After runs (s)", "After median"],
			[
				[
					"Emisoup",
					integer(snapshot.emisoup.moduleCount),
					snapshot.emisoup.beforeBuildSeconds.map((value) => value.toFixed(2)).join(", "),
					appBeforeMedian.toFixed(2) + " s",
					snapshot.emisoup.afterBuildSeconds.map((value) => value.toFixed(2)).join(", "),
					appAfterMedian.toFixed(2) + " s",
				],
				[
					"Playground",
					integer(snapshot.playground.moduleCount),
					snapshot.playground.beforeBuildSeconds.map((value) => value.toFixed(2)).join(", "),
					playgroundBeforeMedian.toFixed(2) + " s",
					snapshot.playground.afterBuildSeconds.map((value) => value.toFixed(2)).join(", "),
					playgroundAfterMedian.toFixed(2) + " s",
				],
			],
			new Set([1, 3, 5]),
		),
		"",
		"The small full-build median shifts are within run-to-run spread and do not establish a build-time win. Two after runs measured " +
			memoryValues.join("–") +
			" GB maximum resident memory. The deterministic " +
			integer(snapshot.sourceScan.files) +
			"-file source-scan workload improved from " +
			sourceScanBeforeMedian.toFixed(2) +
			" ms median parse-and-walk to " +
			sourceScanAfterMedian.toFixed(3) +
			" ms median guarded discovery (" +
			sourceScanImprovement.toFixed(1) +
			"×). Parser calls fell from " +
			integer(snapshot.sourceScan.parserCallsBefore) +
			" to " +
			integer(snapshot.sourceScan.parserCallsAfter) +
			". This phase result is not a multiplier for the full application build.",
		"",
		"The single CPU-profile pair sampled " +
			(snapshot.cpuProfiles.beforeSampledSelfMs / 1000).toFixed(3) +
			" s before and " +
			(snapshot.cpuProfiles.afterSampledSelfMs / 1000).toFixed(3) +
			" s after; AST-walk samples fell from " +
			(snapshot.cpuProfiles.beforeAstWalkSelfMs / 1000).toFixed(3) +
			" s to " +
			(snapshot.cpuProfiles.afterAstWalkSelfMs / 1000).toFixed(3) +
			" s (" +
			(
				(1 - snapshot.cpuProfiles.afterAstWalkSelfMs / snapshot.cpuProfiles.beforeAstWalkSelfMs) *
				100
			).toFixed(0) +
			"% lower). Treat one profile per side as supporting evidence, not a repeated build-time result.",
		"",
		"One instrumented build completed in " +
			snapshot.instrumentedHooks.buildSeconds.toFixed(2) +
			" s. The CSS transform hook ran " +
			integer(snapshot.instrumentedHooks.cssTransformCalls) +
			" times for " +
			(snapshot.instrumentedHooks.cssTransformInclusiveMs / 1000).toFixed(2) +
			" s cumulative inclusive time; concurrent module transforms overlap. CSS generateBundle took " +
			(snapshot.instrumentedHooks.cssGenerateBundleMs / 1000).toFixed(2) +
			" s. Stack-fold transform used " +
			(snapshot.instrumentedHooks.stackFoldTransformInclusiveMs / 1000).toFixed(2) +
			" s cumulative across " +
			integer(snapshot.instrumentedHooks.stackFoldTransformCalls) +
			" calls. The wrapper adds timing overhead.",
		"",
		...currentBuildDetails,
		"### Emisoup client output",
		"",
		"Files are compressed separately with Node zlib gzip level 9 and Brotli quality 11. Totals cover the HTML and all emitted JS/CSS assets, not just the initial route.",
		"",
		markdownTable(
			["Asset group", "Files", "Raw bytes", "gzip 9 bytes", "Brotli 11 bytes"],
			assetRows,
			new Set([1, 2, 3, 4]),
		),
		"",
		"The main Pandwind stylesheet is " +
			integer(css.rawBytes) +
			" raw bytes, " +
			integer(css.gzip9Bytes) +
			" gzip-9 bytes, and " +
			integer(css.brotli11Bytes) +
			" Brotli-11 bytes. The progress-fill case emits " +
			integer(css.progressFillTransitionRuleCount) +
			" transition rule and " +
			integer(css.progressFillWidthVariableRuleCount) +
			" width-variable rule; the authored token path is absent from output, and runtime values " +
			css.progressFillRuntimeValues.join(" and ") +
			" keep the class stable.",
		"",
		"The stylesheet has " +
			integer(css.ruleCount) +
			" rules and " +
			integer(css.duplicateBodyGroups) +
			" repeated declaration-body groups (" +
			integer(css.duplicateRuleCount) +
			" rules, " +
			integer(css.repeatedDeclarationBytes) +
			" repeated raw declaration bytes under an exact declaration-order and at-rule-context key). An order-preserving adjacent-rule prototype merged " +
			integer(css.adjacentRulesMerged) +
			" rules and saved " +
			integer(css.adjacentMergeRawBytesSaved) +
			" raw, " +
			integer(css.adjacentMergeGzip9BytesSaved) +
			" gzip, and " +
			integer(css.adjacentMergeBrotli11BytesSaved) +
			" Brotli bytes. No CSS interning change was adopted; combining non-adjacent rules could cross cascade entries.",
		"",
		"Arena's shared JavaScript remains attributed to Pandwind runtime, preset, cx, and app modules; the measured fold changed none of the six route modules. No JavaScript was removed. Route splitting remains opt-in without first-paint and client-navigation evidence; hashed class names remain the default.",
		"",
	];
};

const renderRealWorldCssExtractionOverview = (
	snapshot: RealWorldCssExtractionSnapshot,
): string[] => {
	const appBeforeMedian = median(snapshot.emisoup.beforeBuildSeconds);
	const appAfterMedian = median(snapshot.emisoup.afterBuildSeconds);
	const playgroundBeforeMedian = median(snapshot.playground.beforeBuildSeconds);
	const playgroundAfterMedian = median(snapshot.playground.afterBuildSeconds);
	const scanBeforeMedian = median(snapshot.sourceScan.parseAndWalkSamplesMs);
	const scanAfterMedian = median(snapshot.sourceScan.guardedScanSamplesMs);
	const css = snapshot.clientAssets.mainPandwindStylesheet;
	return [
		"## Real-world CSS compiler: Emisoup",
		"",
		"Pinned Emisoup source " +
			snapshot.source.emisoupRevision +
			" on Vite " +
			snapshot.environment.vite +
			" transformed " +
			integer(snapshot.emisoup.moduleCount) +
			" modules. Its three-build median was " +
			appAfterMedian.toFixed(2) +
			" s after versus " +
			appBeforeMedian.toFixed(2) +
			" s before; spread prevents an end-to-end speedup claim. On a " +
			integer(snapshot.sourceScan.files) +
			"-file no-CSS workload, guarded discovery reduced the targeted parse-and-walk phase from " +
			scanBeforeMedian.toFixed(2) +
			" ms to " +
			scanAfterMedian.toFixed(3) +
			" ms median, with parser calls dropping from " +
			integer(snapshot.sourceScan.parserCallsBefore) +
			" to " +
			integer(snapshot.sourceScan.parserCallsAfter) +
			". Playground also showed no build regression: " +
			playgroundAfterMedian.toFixed(2) +
			" s after versus " +
			playgroundBeforeMedian.toFixed(2) +
			" s before over " +
			integer(snapshot.playground.moduleCount) +
			" modules.",
		"",
		...renderCurrentBuildRecheckOverview(snapshot.currentBuildRecheck),
		"All emitted Emisoup client assets total " +
			integer(snapshot.clientAssets.total.rawBytes) +
			" raw, " +
			integer(snapshot.clientAssets.total.gzip9Bytes) +
			" gzip-9, and " +
			integer(snapshot.clientAssets.total.brotli11Bytes) +
			" Brotli-11 bytes with each file compressed separately. The main Pandwind CSS asset is " +
			integer(css.rawBytes) +
			" raw, " +
			integer(css.gzip9Bytes) +
			" gzip-9, and " +
			integer(css.brotli11Bytes) +
			" Brotli-11 bytes. The progress-fill keeps static theme styles in CSS and width as a changing CSS variable; detailed hook, profile, CSS duplication, and delivery findings are in [PERF.md](PERF.md#real-world-vite-extraction-emisoup-and-playground).",
		"",
	];
};

const renderCurrentBuildRecheckOverview = (
	recheck: RealWorldCssExtractionSnapshot["currentBuildRecheck"],
): string[] => {
	if (recheck === undefined) return [];
	return [
		"Current package-build recheck measured " +
			recheck.measuredAt +
		" on " +
		recheck.environment.machine +
		", Node " +
		recheck.environment.node +
		", with Emisoup source " +
		recheck.source.emisoupRevision +
		" and Pandwind source " +
		recheck.source.pandwindRevision +
		". Five full build commands had medians of " +
		median(recheck.emisoup.buildWallSeconds).toFixed(2) +
		" s for Emisoup (" +
		Math.min(...recheck.emisoup.buildWallSeconds).toFixed(2) +
		"–" +
		Math.max(...recheck.emisoup.buildWallSeconds).toFixed(2) +
		" s) and " +
		median(recheck.playground.buildWallSeconds).toFixed(2) +
		" s for Playground (" +
		Math.min(...recheck.playground.buildWallSeconds).toFixed(2) +
		"–" +
		Math.max(...recheck.playground.buildWallSeconds).toFixed(2) +
		" s). These are variability samples, not a before/after speedup claim.",
		"",
	];
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
			`${label} (${snapshot.updatedAt})`,
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
				`API ${name} (${apiSnapshot.updatedAt})`,
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
	if (name.startsWith("createCss(minimal preset)")) return "preset-bound fallback";
	if (name.startsWith("createCss(csstypePreset)")) return "preset-bound structural";
	if (name.startsWith("createCss(tailwindPreset)")) return "preset-bound tailwind";
	if (name.startsWith("createCss(chakraPreset)")) return "preset-bound chakra";
	if (name.startsWith("createCss(shadcnPreset)")) return "preset-bound shadcn";
	if (name.startsWith("createCss(pandaPreset)")) return "preset-bound panda";
	if (name.startsWith("createCss(defaultPreset)")) return "preset-bound default";
	if (name.startsWith("createCss(fixturePreset)")) return "preset-bound full catalog";
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

const ecosystemLibrary = (library: string): string =>
	({
		pandwind: "Pandwind css() (static)",
		tailwind: "Tailwind CSS",
		panda: "Panda CSS",
		stylex: "StyleX",
		"vanilla-extract": "Vanilla Extract",
		sprinkles: "Sprinkles",
		unocss: "UnoCSS",
		linaria: "Linaria",
		"pandwind-css": "Pandwind css() (dynamic)",
		"pandwind-runtime": "Pandwind createRuntimeCss()",
		"pandwind-unsafe": "Pandwind createUnsafeCss()",
		emotion: "Emotion",
		"styled-components": "styled-components",
		goober: "Goober",
	})[library] ?? library;

const renderEcosystemBundleTable = (
	snapshot: EcosystemBundleSnapshot,
	category: EcosystemBundleSnapshot["workloads"][number]["category"],
): string => {
	const rows = snapshot.workloads
		.filter((workload) => workload.category === category)
		.toSorted(
			(left, right) =>
				left.delta.total.gz - right.delta.total.gz || left.library.localeCompare(right.library),
		)
		.map((workload, index) => [
			String(index + 1),
			ecosystemLibrary(workload.library),
			workload.buildMode,
			`${signedKilobytes(workload.delta.js.min)} / ${signedKilobytes(workload.delta.js.gz)}`,
			`${signedKilobytes(workload.delta.css.min)} / ${signedKilobytes(workload.delta.css.gz)}`,
			signedKilobytes(workload.delta.total.gz),
			workload.cssDelivery,
			workload.arbitraryRuntimeValues ? "yes" : "no",
		]);
	return markdownTable(
		[
			"Rank",
			"Library",
			"Build mode",
			"JS min / gzip",
			"CSS min / gzip",
			"Total gzip",
			"CSS delivery",
			"Runtime values",
		],
		rows,
		new Set([0, 3, 4, 5, 7]),
	);
};

const renderEcosystemBundleComparison = (
	snapshot: EcosystemBundleSnapshot | undefined,
): string[] => {
	if (snapshot === undefined || snapshot.workloads.length === 0) return [];
	return [
		"## Ecosystem bundle-size comparison",
		"",
		`Measured on ${snapshot.environment.platform}/${snapshot.environment.arch} with Node ${snapshot.environment.node}, Vite ${snapshot.environment.vite}, and esbuild ${snapshot.environment.esbuild}; snapshot updated ${snapshot.updatedAt}. Each value is the styled app minus its unstyled app baseline, in decimal KB.`,
		"",
		"Static production output ships extracted CSS. Runtime/dynamic output keeps style creation in browser JavaScript; the CSS delivery column distinguishes injected rules from Pandwind fallback lanes that require a host stylesheet.",
		"",
		"### Static production output",
		"",
		renderEcosystemBundleTable(snapshot, "static"),
		"",
		"### Runtime/dynamic output",
		"",
		renderEcosystemBundleTable(snapshot, "runtime"),
		"",
		"Full styled/baseline metrics, pinned versions, and the fixture methodology: [bundle-size.md](benchmarks/styling-size/snapshots/bundle-size.md).",
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

const formatExternalMetric = (value: number, unit: string): string => {
	if (unit === "tiles/s") return `${integer(value)} ${unit}`;
	if (unit === "gzip bytes") return `${kilobytes(value)} KB`;
	return `${value.toFixed(2)} ${unit}`;
};

const renderRankedExternalWorkload = (
	workload: ExternalBenchmarkWorkload,
	targetTech: string,
): string[][] => {
	if (workload.id === "inp") {
		const medians = workload.results.map((result) => result.value);
		const p95Values = workload.results.flatMap((result) =>
			result.p95Ms === undefined ? [] : [result.p95Ms],
		);
		const targetResult = workload.results.find((result) => result.tech === targetTech);
		const mediansRange = `${Math.min(...medians).toFixed(1)}–${Math.max(...medians).toFixed(1)} ms`;
		const p95Range =
			p95Values.length === 0
				? ""
				: `; p95 ${Math.min(...p95Values).toFixed(1)}–${Math.max(...p95Values).toFixed(1)} ms`;
		return [
			[
				workload.label,
				workload.caseId,
				`Unranked: medians cluster at ${mediansRange}${p95Range}; this frame-timed range does not support a useful rank`,
				targetResult === undefined
					? "not measured"
					: `unranked — ${formatExternalMetric(targetResult.value, workload.unit)}`,
			],
		];
	}
	const ranked = workload.results.toSorted((left, right) =>
		workload.direction === "higher"
			? right.value - left.value || left.label.localeCompare(right.label)
			: left.value - right.value || left.label.localeCompare(right.label),
	);
	const targetIndex = ranked.findIndex((result) => result.tech === targetTech);
	const topFive = ranked
		.slice(0, 5)
		.map(
			(result, index) =>
				`${index + 1}. ${result.label} (${formatExternalMetric(result.value, workload.unit)})`,
		)
		.join("<br>");
	const target =
		targetIndex < 0
			? "not measured"
			: `#${targetIndex + 1}/${ranked.length} — ${formatExternalMetric(ranked[targetIndex]!.value, workload.unit)}${
					ranked[targetIndex]!.payload === undefined
						? ""
						: ` (JS ${kilobytes(ranked[targetIndex]!.payload.js)} KB; CSS ${kilobytes(ranked[targetIndex]!.payload.css)} KB; HTML ${kilobytes(ranked[targetIndex]!.payload.html)} KB)`
				}`;
	return [[workload.label, workload.caseId, topFive, target]];
};

const renderCssInJsBenchComparison = (snapshot: CssInJsBenchSnapshot | undefined): string[] => {
	if (snapshot === undefined) return [];
	const rows = snapshot.workloads.flatMap((workload) =>
		renderRankedExternalWorkload(workload, snapshot.source.pandwindMainLane),
	);
	if (rows.length === 0) return [];
	const twBonusRows = snapshot.workloads.flatMap((workload) => {
		const peerResults = workload.results.filter(
			({ tech }) => tech !== snapshot.source.pandwindMainLane,
		);
		if (workload.bonusResults.length === 0) return [];
		return renderRankedExternalWorkload(
			{ ...workload, results: [...peerResults, ...workload.bonusResults] },
			snapshot.source.pandwindTwBonusLane,
		);
	});
	const payload = snapshot.workloads.find(({ id }) => id === "payload");
	const primaryPayload = payload?.results.find(
		({ tech }) => tech === snapshot.source.pandwindMainLane,
	);
	const namedPayload = payload?.strategyResults.find(
		({ tech }) => tech === snapshot.source.pandwindNamedStrategyDiagnostic,
	);
	const namedStrategyRows =
		primaryPayload?.payload === undefined || namedPayload?.payload === undefined
			? []
			: [
					[
						"Hash (default)",
						`${integer(primaryPayload.value)} B`,
						`${integer(primaryPayload.payload.js)} B`,
						`${integer(primaryPayload.payload.css)} B`,
						`${integer(primaryPayload.payload.html)} B`,
					],
					[
						"Named atoms",
						`${integer(namedPayload.value)} B`,
						`${integer(namedPayload.payload.js)} B`,
						`${integer(namedPayload.payload.css)} B`,
						`${integer(namedPayload.payload.html)} B`,
					],
				];
	return [
		"## [CSS-in-JS Bench](https://github.com/jantimon/css-in-js-bench): primary `createCss` lane",
		"",
		`A 400-tile shop page; WPD finished ${snapshot.source.wpdCompletedAt} on ${snapshot.source.host} with Node ${snapshot.source.node}, WPD ${snapshot.source.wpdVersion}, Chrome ${snapshot.source.browsers.chrome ?? "unknown"}, and Firefox ${snapshot.source.browsers.firefox ?? "unknown"}. The snapshot covers ${snapshot.source.laneCount} harness lanes and ${snapshot.source.caseCount} workloads. Pandwind source: ${snapshot.source.pandwindRevision}; CSS-in-JS Bench source: ${snapshot.source.cssInJsBenchRevision}. The primary score uses ${snapshot.source.pandwindMainLane} and non-Pandwind peers; utility and strategy diagnostics do not change that denominator. Payload is gzipped JS + CSS + HTML; browser figures are Chrome medians. Lower is better except SSR throughput.`,
		"",
		markdownTable(["Measure", "Workload", "Top five", "Pandwind `css()`"], rows, new Set()),
		"",
		"The primary lane uses `createCss(preset)` with `css.class(...)` for class-string hosts and a static multi-map `css(...)` + `css.props(...)` tile host, compiled by the shipped `pandwindCssVite(css)` plugin. The only runtime style value is the rating percentage custom property. Values are per-metric rankings; there is no cross-category score.",
		"",
		"### Separate `tw()` bonus lane",
		"",
		"This uses the same peer set with the primary `css()` row swapped for the literal `tw()` lane. It is shown separately and never changes the primary rank.",
		"",
		markdownTable(
			["Measure", "Workload", "Top five", "Pandwind `tw()` bonus"],
			twBonusRows,
			new Set(),
		),
		...(namedStrategyRows.length === 0
			? []
			: [
					"",
					"### Hash versus named atoms",
					"",
					"Both rows use the same `createCss` page and compiler; named atoms are a strategy diagnostic, not another library score.",
					"",
					markdownTable(
						["Strategy", "Total gzip", "JS", "CSS", "HTML"],
						namedStrategyRows,
						new Set(),
					),
				]),
		"",
		"The normalized source data is [snapshot.json](benchmarks/css-in-js-bench/snapshot.json).",
		"",
	];
};

const renderDetailedExternalWorkload = (
	workload: ExternalBenchmarkWorkload,
	results: readonly ExternalBenchmarkResult[],
): string[] => {
	const ordered =
		workload.id === "inp"
			? results.toSorted((left, right) => left.label.localeCompare(right.label))
			: results.toSorted((left, right) =>
					workload.direction === "higher"
						? right.value - left.value || left.label.localeCompare(right.label)
						: left.value - right.value || left.label.localeCompare(right.label),
				);
	const rows = ordered.map((result, index) => [
		workload.id === "inp" ? "unranked" : String(index + 1),
		result.label,
		formatExternalMetric(result.value, workload.unit),
		result.p95Ms === undefined ? "—" : `${result.p95Ms.toFixed(1)} ms`,
		result.payload === undefined ? "—" : `${integer(result.payload.js)} B`,
		result.payload === undefined ? "—" : `${integer(result.payload.css)} B`,
		result.payload === undefined ? "—" : `${integer(result.payload.html)} B`,
	]);
	return [
		`### ${workload.label} — ${workload.caseId}`,
		"",
		...(workload.id === "inp"
			? ["INP is not ranked because frame-timed medians cluster within measurement noise.", ""]
			: []),
		markdownTable(
			["Rank", "Implementation", "Result", "P95", "JS gzip", "CSS gzip", "HTML gzip"],
			rows,
			new Set([0]),
		),
		"",
	];
};

const renderDetailedCssInJsBenchComparison = (
	snapshot: CssInJsBenchSnapshot | undefined,
): string[] => {
	if (snapshot === undefined) return [];
	const { source } = snapshot;
	const mainLane = source.pandwindMainLane;
	const twBonusLane = source.pandwindTwBonusLane;
	const primaryWorkloads = snapshot.workloads.flatMap((workload) =>
		workload.results.length === 0
			? []
			: [...renderDetailedExternalWorkload(workload, workload.results)],
	);
	const twBonusWorkloads = snapshot.workloads.flatMap((workload) => {
		if (workload.bonusResults.length === 0) return [];
		const peerResults = workload.results.filter(({ tech }) => tech !== mainLane);
		return renderDetailedExternalWorkload(workload, [...peerResults, ...workload.bonusResults]);
	});
	const payload = snapshot.workloads.find(({ id }) => id === "payload");
	const strategyRows =
		payload?.strategyResults.map((result) => [
			result.label,
			`${integer(result.value)} B`,
			result.payload === undefined ? "—" : `${integer(result.payload.js)} B`,
			result.payload === undefined ? "—" : `${integer(result.payload.css)} B`,
			result.payload === undefined ? "—" : `${integer(result.payload.html)} B`,
		]) ?? [];
	const buildtimeSamples = source.pandwindBuildtimeSamples;
	const buildtimeContext =
		buildtimeSamples === undefined
			? []
			: [
					"### Cold-build method and samples",
					"",
					"Pandwind cold runs were " +
						buildtimeSamples.coldMs.join(", ") +
						" ms (median " +
						median(buildtimeSamples.coldMs) +
						" ms); immediate warm runs were " +
						buildtimeSamples.warmMs.join(", ") +
						" ms (median " +
						median(buildtimeSamples.warmMs) +
						" ms). The harness clears the lane's output and Vite caches, then measures the whole client build through Vite's build API in one Node process; it does not cold-start the process or operating-system caches. It records no phase timings. Treat the 375 ms rank as a lane-level diagnostic, not as a real-project build-time comparison.",
					"",
				];
	return [
		"## CSS-in-JS Bench detailed results",
		"",
		`WPD ${source.wpdVersion} completed ${source.wpdCompletedAt} on ${source.host} with Node ${source.node}, Chrome ${source.browsers.chrome ?? "unknown"}, and Firefox ${source.browsers.firefox ?? "unknown"}. CSS-in-JS Bench revision ${source.cssInJsBenchRevision}; Pandwind artifact revision ${source.pandwindRevision}; ${source.laneCount} lanes and ${source.caseCount} workload definitions. The CSS lane is the 400-tile product-grid case. Rankings compare ${mainLane} with non-Pandwind peer lanes; per-call JS, CSS, and SSR HTML payload components are gzip bytes. Browser measurements are Chrome medians.`,
		"",
		"### Primary `createCss` lane",
		"",
		"The lane uses `createCss(preset)`, static `css.class(...)` declarations, and a multi-map `css(...)` plus `css.props(...)` host boundary through the shipped `pandwindCssVite(css)` plugin. Only the rating percentage remains a runtime style value.",
		"",
		...primaryWorkloads,
		...buildtimeContext,
		"### Separate `tw()` bonus lane",
		"",
		`This lane uses ${twBonusLane} and ranks against the same peer set with ${mainLane} removed. It does not contribute to the primary rank.`,
		"",
		...twBonusWorkloads,
		...(strategyRows.length === 0
			? []
			: [
					"### Named atom strategy diagnostic",
					"",
					"This is a strategy comparison for the same page, not an additional library lane.",
					"",
					markdownTable(
						["Implementation", "Total gzip", "JS", "CSS", "HTML"],
						strategyRows,
						new Set(),
					),
					"",
				]),
		`Normalized measurements: [snapshot.json](benchmarks/css-in-js-bench/snapshot.json).`,
		"",
	];
};

const renderNaturalTypecheckRanking = (snapshot: StylingSnapshot | undefined): string[] => {
	if (snapshot === undefined) return [];
	const ranked = snapshot.workloads
		.filter((workload) => workload.scenario === "natural")
		.toSorted(
			(left, right) =>
				left.metrics.instantiations - right.metrics.instantiations ||
				left.library.localeCompare(right.library),
		);
	if (ranked.length === 0) return [];
	const topFive = ranked
		.slice(0, 5)
		.map(
			(workload, index) =>
				`${index + 1}. ${displayLibrary(workload.library)} (${integer(workload.metrics.instantiations)} inst.; ${seconds(workload.metrics.checkTimeSeconds)} s)`,
		)
		.join("<br>");
	const pandwindIndex = ranked.findIndex((workload) => workload.library === "pandwind");
	const pandwind =
		pandwindIndex < 0
			? "not measured"
			: `#${pandwindIndex + 1}/${ranked.length} — ${integer(ranked[pandwindIndex]!.metrics.instantiations)} inst.; ${seconds(ranked[pandwindIndex]!.metrics.checkTimeSeconds)} s`;
	return [
		"## Consumer typecheck: natural CSS usage",
		"",
		`TypeScript ${snapshot.environment.typescript}, snapshot updated ${snapshot.updatedAt}; this is the natural-use fixture, not the synthetic stress case. Ranked by instantiations because the short check times are close to process overhead; check time remains visible for context.`,
		"",
		markdownTable(
			["Measure", "Top five", "Pandwind (inferred)"],
			[["TypeScript instantiations (check time)", topFive, pandwind]],
			new Set(),
		),
		"",
	];
};

const renderStaticBundleRanking = (snapshot: EcosystemBundleSnapshot | undefined): string[] => {
	if (snapshot === undefined) return [];
	const ranked = snapshot.workloads
		.filter((workload) => workload.category === "static")
		.toSorted(
			(left, right) =>
				left.delta.total.gz - right.delta.total.gz || left.library.localeCompare(right.library),
		);
	if (ranked.length === 0) return [];
	const topFive = ranked
		.slice(0, 5)
		.map(
			(workload, index) =>
				`${index + 1}. ${ecosystemLibrary(workload.library)} (${signedKilobytes(workload.delta.total.gz)})`,
		)
		.join("<br>");
	const pandwindIndex = ranked.findIndex((workload) => workload.library === "pandwind");
	const pandwind =
		pandwindIndex < 0
			? "not measured"
			: `#${pandwindIndex + 1}/${ranked.length} — ${signedKilobytes(ranked[pandwindIndex]!.delta.total.gz)}`;
	return [
		"## Static production output size",
		"",
		`Styled app minus unstyled app baseline, gzip total, snapshot updated ${snapshot.updatedAt}. Lower is smaller.`,
		"",
		markdownTable(
			["Measure", "Top five", "Pandwind"],
			[["Static output delta", topFive, pandwind]],
			new Set(),
		),
		"",
	];
};

export const renderPerformanceOverview = (): string => {
	const styling = readJson<StylingSnapshot>(stylingSnapshotPath);
	const ecosystemBundleSizes = readJson<EcosystemBundleSnapshot>(ecosystemBundleSizeSnapshotPath);
	const cssInJsBench = readJson<CssInJsBenchSnapshot>(cssInJsBenchSnapshotPath);
	const arena = readJson<ArenaSnapshot>(arenaSnapshotPath);
	const realWorldCssExtraction = readJson<RealWorldCssExtractionSnapshot>(
		realWorldCssExtractionSnapshotPath,
	);
	if (cssInJsBench === undefined) {
		throw new Error(`missing ${cssInJsBenchSnapshotPath}; import a CSS-in-JS Bench report first`);
	}
	if (realWorldCssExtraction === undefined || realWorldCssExtraction.schemaVersion !== 1) {
		throw new Error(`missing or unsupported ${realWorldCssExtractionSnapshotPath}`);
	}
	return [
		"<!-- Generated by scripts/render-performance-summary.mts; do not edit. -->",
		"",
		"# Pandwind performance overview",
		"",
		"Quick view of the main API and real-world workload comparisons. For complete measurements, synthetic stress cases, snapshots, and methodology, see [PERF.md](PERF.md). Rankings are per metric; there is no single score across unlike workloads.",
		"",
		...renderNaturalTypecheckRanking(styling),
		...renderStaticBundleRanking(ecosystemBundleSizes),
		...renderCssInJsBenchComparison(cssInJsBench),
		...renderArenaComparison(arena),
		...renderRealWorldCssExtractionOverview(realWorldCssExtraction),
		"## Benchmark cadence",
		"",
		"Run focused regression benchmarks with changes to the compiler, runtime, public API, or bundler plugin paths they cover. Refresh the full local comparison before releases and monthly while performance work is active. Refresh external CSS-in-JS Bench/Arena comparisons quarterly, or sooner when a benchmarked library or its major version changes. A JJ revision by itself is not a reason to rerun the full matrix.",
		"",
		"## Refresh",
		"",
		"1. Run the local commands listed at the end of [PERF.md](PERF.md).",
		"2. In a separate CSS-in-JS Bench checkout, run `pnpm gen:samples --measure=microbench,payload,buildtime`, then `pnpm gen:wpd`, `pnpm verify`, and `pnpm report`.",
		"3. In CSS-in-JS Arena, refresh the pinned Pandwind tarball, pass the six-route geometry and screenshot gates, then run the byte, build, dev-start, and four-sweep HMR measurements. Keep parity and source revisions with the results.",
		"4. Import `BENCHMARK.json` with `node scripts/import-css-in-js-bench.mjs /path/to/BENCHMARK.json <pandwind-commit>`, update `benchmarks/css-in-js-arena/snapshot.json`, then run `pnpm run bench:summary` and `pnpm run bench:summary:check`.",
		"",
	].join("\n");
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
	const ecosystemBundleSizes = readJson<EcosystemBundleSnapshot>(ecosystemBundleSizeSnapshotPath);
	const cssInJsBench = readJson<CssInJsBenchSnapshot>(cssInJsBenchSnapshotPath);
	const arena = readJson<ArenaSnapshot>(arenaSnapshotPath);
	const realWorldCssExtraction = readJson<RealWorldCssExtractionSnapshot>(
		realWorldCssExtractionSnapshotPath,
	);
	if (realWorldCssExtraction === undefined || realWorldCssExtraction.schemaVersion !== 1) {
		throw new Error(`missing or unsupported ${realWorldCssExtractionSnapshotPath}`);
	}
	const lines = [
		"<!-- Generated by scripts/render-performance-summary.mts; do not edit. -->",
		"",
		"# Pandwind performance details",
		"",
		"For the concise real-world comparison, see [PERF-SUMMARY.md](PERF-SUMMARY.md). This detailed report includes committed typecheck, runtime-throughput, bundle-size, CSS-in-JS Bench, and Arena snapshots. Lower is better for typecheck/size; higher is better for throughput. Rankings are per workload and metric, not a universal library score.",
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
	lines.push(...renderEcosystemBundleComparison(ecosystemBundleSizes));
	lines.push(...renderDetailedCssInJsBenchComparison(cssInJsBench));
	lines.push(...renderArenaDetails(arena));
	lines.push(...renderRealWorldCssExtractionDetails(realWorldCssExtraction));
	lines.push(
		"## External benchmark refresh",
		"",
		"After refreshing CSS-in-JS Bench in a separate checkout, import its generated report with `node scripts/import-css-in-js-bench.mjs /path/to/BENCHMARK.json <pandwind-commit>`. Update the [CSS-in-JS Arena snapshot](benchmarks/css-in-js-arena/snapshot.json) only after its Pandwind lane passes the six-page parity gates; that snapshot drives the Arena rankings in PERF-SUMMARY.md.",
		"",
	);
	lines.push(
		"## Sources and refresh commands",
		"",
		"- Typecheck ecosystem: `pnpm run bench:tsc:styling -- --update`",
		"- Generated facade comparison: `pnpm run bench:tsc:generated -- --update`",
		"- Package/example typecheck: `pnpm run bench:tsc -- --update` and `pnpm run bench:tsc:example -- --update`",
		"- Public API typecheck: `pnpm --filter pandwind run test:tsc -- -u`",
		"- Runtime size: `pnpm --filter pandwind exec vitest run runtime-size -u`",
		"- Runtime API throughput: `pnpm --filter pandwind run test:benchmarks -- -u`",
		"- Ecosystem bundle-size comparison: `pnpm run bench:size:ecosystem -- --update`",
		"- Real-world CSS extraction evidence: `benchmarks/real-world-css-extraction/snapshot.json`",
		"- Summary freshness: `pnpm run bench:summary:check`",
		"",
	);
	return lines.join("\n");
};

export const writePerformanceSummary = (): void => {
	writeFileSync(PERFORMANCE_SUMMARY, renderPerformanceSummary());
	writeFileSync(PERFORMANCE_OVERVIEW, renderPerformanceOverview());
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
	if (!existsSync(PERFORMANCE_OVERVIEW)) {
		throw new Error(`missing ${PERFORMANCE_OVERVIEW}; run pnpm run bench:summary`);
	}
	const expectedOverview = renderPerformanceOverview();
	const actualOverview = readFileSync(PERFORMANCE_OVERVIEW, "utf8");
	if (actualOverview !== expectedOverview) {
		throw new Error("PERF-SUMMARY.md is stale; run pnpm run bench:summary");
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
