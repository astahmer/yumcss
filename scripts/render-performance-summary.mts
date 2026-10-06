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

type RuntimeApiFollowupsSnapshot = {
	readonly schemaVersion: 1;
	readonly updatedAt: string;
	readonly environment: {
		readonly platform: string;
		readonly arch: string;
		readonly node: string;
	};
	readonly method: string;
	readonly measurements: readonly {
		readonly name: string;
		readonly operation: string;
		readonly iterationsPerSample: number;
		readonly samplesPerProcess: number;
		readonly before: {
			readonly revision: string;
			readonly runs: readonly {
				readonly medianOpsPerSecond: number;
				readonly p10?: number;
				readonly p90?: number;
			}[];
		};
		readonly after: {
			readonly revision: string;
			readonly runs: readonly {
				readonly medianOpsPerSecond: number;
				readonly p10?: number;
				readonly p90?: number;
			}[];
		};
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
	readonly parityVerification?: {
		readonly measuredAt: string;
		readonly benchmarkRevision: string;
		readonly yumcssArtifactRevision: string;
		readonly reportPath: string;
		readonly hydration: "passed" | "skipped" | "failed";
		readonly hydrationNote?: string;
	};
	readonly source: {
		readonly repository: string;
		readonly url: string;
		readonly cssInJsBenchRevision: string;
		readonly yumcssRevision: string;
		readonly yumcssMainLane: string;
		readonly yumcssTwBonusLane: string;
		readonly yumcssNamedStrategyDiagnostic: string;
		readonly wpdCompletedAt: string;
		readonly host: string;
		readonly node: string;
		readonly gitSha: string;
		readonly wpdVersion: string;
		readonly browsers: { readonly chrome?: string; readonly firefox?: string };
		readonly laneCount: number;
		readonly caseCount: number;
		readonly yumcssBuildtimeSamples?: {
			readonly coldMs: readonly number[];
			readonly warmMs: readonly number[];
		};
		readonly yumcssBuildtimeProfile?: {
			readonly yumcssRevision: string;
			readonly measuredAt: string;
			readonly harness: string;
			readonly samples: number;
			readonly totalBuildMs: number;
			readonly phasesMs: {
				readonly load: number;
				readonly resolve: number;
				readonly buildStart: number;
				readonly cssTransformInclusive: number;
				readonly cssGenerateBundle: number;
			};
		};
	};
	readonly workloads: readonly ExternalBenchmarkWorkload[];
};

type CssInJsBenchParityReport = {
	readonly ok: boolean;
	readonly generatedAt: string;
	readonly reports: readonly {
		readonly caseId: string;
		readonly ok: boolean;
		readonly notes: readonly string[];
	}[];
};

type ArenaLibrary = "bamboo" | "stylex" | "panda" | "yumcss";

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
	readonly yumcssMaxImageDifferencePercent: number;
	readonly maxImageDifferencePercent: number;
};

type ArenaOutputVerification = {
	readonly yumcssRevision: string;
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

type ArenaScaleMeasurement = {
	readonly styles: number;
	readonly rawBytes: number;
	readonly gzip9Bytes: number;
	readonly brotli11Bytes: number;
	readonly blocks: number;
};

type ArenaScaleSweep = {
	readonly measuredAt: string;
	readonly arenaRevision: string;
	readonly yumcssRevision: string;
	readonly stylesPerRun: readonly number[];
	readonly declarationsPerStyle: number;
	readonly allDeclarationValuesUnique: boolean;
	readonly harnessCorrection: string;
	readonly measurements: {
		readonly bamboo: readonly ArenaScaleMeasurement[];
		readonly stylex: readonly ArenaScaleMeasurement[];
		readonly panda: readonly ArenaScaleMeasurement[];
		readonly yumcssHash: readonly ArenaScaleMeasurement[];
		readonly yumcssNamedAtoms: readonly ArenaScaleMeasurement[];
	};
	readonly yumcssHashGrowthBreakdown: {
		readonly base: Omit<ArenaScaleMeasurement, "styles" | "blocks">;
		readonly at800: Omit<ArenaScaleMeasurement, "styles" | "blocks">;
		readonly declarationInputs: number;
		readonly uniqueAtomicRules: number;
		readonly growth: {
			readonly rawBytes: number;
			readonly gzip9Bytes: number;
			readonly brotli11Bytes: number;
			readonly classNameRawBytes: number;
			readonly selectorSyntaxRawBytes: number;
			readonly declarationRawBytes: number;
			readonly ruleSyntaxRawBytes: number;
			readonly interRuleWhitespaceRawBytes: number;
			readonly newConditionWrappers: number;
			readonly newLayerWrapperBytes: number;
			readonly sharedLayerContext: string;
		};
	};
	readonly namedAtomTradeoffs: {
		readonly hashBrotliSlopePerDeclaration: number;
		readonly namedAtomBrotliSlopePerDeclaration: number;
		readonly hashAt800BrotliBytes: number;
		readonly namedAtomsAt800BrotliBytes: number;
		readonly benchPageHashGzipBytes: number;
		readonly benchPageNamedAtomsGzipBytes: number;
		readonly arenaClassAttributeRawBytesAdded: number;
		readonly strictTwoBytePerDeclarationProbePassed: boolean;
	};
};

type ArenaSnapshot = {
	readonly schemaVersion: 1;
	readonly source: {
		readonly url: string;
		readonly arenaRevision: string;
		readonly yumcssRevision: string;
		readonly measuredAt: string;
		readonly environment: string;
		readonly parity: ArenaParity;
	};
	readonly metrics: readonly ArenaMetric[];
	readonly outputVerification?: ArenaOutputVerification;
	readonly scaleSweep?: ArenaScaleSweep;
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

type TwCodegenSnapshot = {
	readonly schemaVersion: 1;
	readonly measuredAt: string;
	readonly environment: {
		readonly machine: string;
		readonly node: string;
		readonly tailwindCss: string;
		readonly typescript: string;
		readonly vite: string;
	};
	readonly source: {
		readonly beforeYumCSSRevision: string;
		readonly afterYumCSSChange: string;
	};
	readonly defaultCatalogGate: {
		readonly utilities: number;
		readonly variants: number;
		readonly typesDtsRawBytes: number;
		readonly interopRawBytes: number;
		readonly interopGzipBytes: number;
		readonly yumcssPackageTarballBytes: number;
	};
	readonly playground: {
		readonly generatedArtifacts: {
			readonly fileCount: number;
			readonly beforeTotalRawBytes: number;
			readonly afterTotalRawBytes: number;
			readonly interopBefore: {
				readonly schema: string;
				readonly rawBytes: number;
				readonly gzipBytes: number;
			};
			readonly interopAfter: {
				readonly schema: string;
				readonly rawBytes: number;
				readonly gzipBytes: number;
			};
			readonly gzipMethod: string;
		};
		readonly generation: {
			readonly command: string;
			readonly beforeWallSeconds: readonly number[];
			readonly afterWallSeconds: readonly number[];
			readonly beforePeakRssBytes: readonly number[];
			readonly afterPeakRssBytes: readonly number[];
			readonly scope: string;
		};
		readonly typecheck: {
			readonly before: Metrics;
			readonly after: Metrics;
		};
		readonly migrationRoute: {
			readonly name: string;
			readonly beforeRawBytes: number;
			readonly beforeGzipBytes: number;
			readonly afterRawBytes: number;
			readonly afterGzipBytes: number;
			readonly containsInteropV2: boolean;
			readonly containsGeneratedUtilityValues: boolean;
		};
	};
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
		readonly yumcssBeforeRevision: string;
		readonly yumcssAfterRevision: string;
	};
	readonly currentBuildRecheck?: {
		readonly measuredAt: string;
		readonly source: {
			readonly emisoupRevision: string;
			readonly yumcssRevision: string;
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
	readonly sourceFilterComparison?: {
		readonly measuredAt: string;
		readonly source: {
			readonly emisoupRevision: string;
			readonly baselineYumCSSRevision: string;
			readonly filteredYumCSSRevision: string;
		};
		readonly environment: {
			readonly machine: string;
			readonly node: string;
			readonly emisoupVite: string;
			readonly playgroundVite: string;
		};
		readonly processTreeRssSampleIntervalMs: number;
		readonly fullBuilds: Readonly<
			Record<
				"emisoup" | "playground",
				{
					readonly command: string;
					readonly beforeBuildSeconds: readonly number[];
					readonly afterBuildSeconds: readonly number[];
					readonly beforePeakProcessTreeRssMiB: readonly number[];
					readonly afterPeakProcessTreeRssMiB: readonly number[];
				}
			>
		>;
		readonly instrumentedEmisoupApiProfile: {
			readonly runsPerMode: number;
			readonly cssTransformCallsPerRun: number;
			readonly filterDisabled: {
				readonly buildSeconds: readonly number[];
				readonly cssTransformInclusiveSeconds: readonly number[];
				readonly cssGenerateBundleSeconds: readonly number[];
			};
			readonly filterEnabled: {
				readonly buildSeconds: readonly number[];
				readonly cssTransformInclusiveSeconds: readonly number[];
				readonly cssGenerateBundleSeconds: readonly number[];
			};
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
		readonly mainYumCSSStylesheet: {
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

type SourceFilterComparison = NonNullable<RealWorldCssExtractionSnapshot["sourceFilterComparison"]>;

type RankingMetric = "checkTimeSeconds" | "instantiations";

const stylingSnapshotPath = resolve(ROOT, "benchmarks/styling-tsc/snapshots/tsc.json");
const generatedSnapshotPath = resolve(
	ROOT,
	"benchmarks/styling-tsc/snapshots/generated-types-poc.json",
);
const packageSnapshotPath = resolve(ROOT, "plans/evidence/yumcss-tsc.json");
const exampleSnapshotPath = resolve(ROOT, "plans/evidence/yumcss-example-tsc.json");
const apiSnapshotPath = resolve(ROOT, "packages/yumcss/tests/snapshots/tsc.json.snap");
const runtimeApiSnapshotPath = resolve(
	ROOT,
	"packages/yumcss/tests/snapshots/runtime-api-benchmark.json.snap",
);
const runtimeApiFollowupsSnapshotPath = resolve(ROOT, "benchmarks/runtime-api-followups.json");
const runtimeSizeSnapshotPath = resolve(
	ROOT,
	"packages/yumcss/tests/snapshots/runtime-size.json.snap",
);
const generatedRuntimeSizeSnapshotPath = resolve(
	ROOT,
	"packages/yumcss/tests/snapshots/generated-runtime-size.json.snap",
);
const ecosystemBundleSizeSnapshotPath = resolve(
	ROOT,
	"benchmarks/styling-size/snapshots/bundle-size.json",
);
const cssInJsBenchSnapshotPath = resolve(ROOT, "benchmarks/css-in-js-bench/snapshot.json");
const cssInJsBenchParityReportPath = resolve(
	ROOT,
	"benchmarks/css-in-js-bench/parity-verification.json",
);
const arenaSnapshotPath = resolve(ROOT, "benchmarks/css-in-js-arena/snapshot.json");
const realWorldCssExtractionSnapshotPath = resolve(
	ROOT,
	"benchmarks/real-world-css-extraction/snapshot.json",
);
const twCodegenSnapshotPath = resolve(ROOT, "benchmarks/tw-codegen/snapshot.json");

const readJson = <T,>(path: string): T | undefined => {
	if (!existsSync(path)) return undefined;
	return JSON.parse(readFileSync(path, "utf8")) as T;
};

const integer = (value: number): string => Math.round(value).toLocaleString("en-US");
const seconds = (value: number): string => value.toFixed(3);
const kilobytes = (value: number): string => (Math.round(value / 10) / 100).toFixed(2);
const medianOfProcessRuns = (values: readonly number[]): number => {
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
	{ id: "yumcss", label: "YumCSS" },
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
		const yumcssIndex = ranked.findIndex((entry) => entry.id === "yumcss");
		const yumcss = ranked[yumcssIndex]!;
		return [
			metric.category,
			metric.label,
			topThree,
			`#${yumcssIndex + 1}/4 — ${formatArenaValue(yumcss.value, metric.unit)}`,
		];
	});
	return [
		"## [CSS-in-JS Arena](https://github.com/gajus/css-in-js-arena) six-page comparison",
		"",
		`YumCSS's six-page lane passed parity: ${parity.geometryPassed}/${parity.geometryTotal} route geometry checks stayed within ${parity.geometryThresholdPx} px; ${parity.screenshotsPassed}/${parity.screenshotsTotal} screenshots stayed below ${parity.screenshotThresholdPercent}%. Measured ${snapshot.source.measuredAt} on ${snapshot.source.environment}. Lower is better; each row ranks the four engines independently, with no combined score.`,
		"",
		markdownTable(["Category", "Measure", "Top three", "YumCSS"], rows, new Set()),
		"",
		`YumCSS's maximum screenshot difference was ${parity.yumcssMaxImageDifferencePercent}%; maximum across all lanes was ${parity.maxImageDifferencePercent}%. The Arena worktree records full methods and stress results in revision ${snapshot.source.arenaRevision}; normalized inputs are in the [local comparison snapshot](benchmarks/css-in-js-arena/snapshot.json). YumCSS source revision ${snapshot.source.yumcssRevision}.`,
		"",
		...renderArenaOutputVerificationOverview(snapshot),
		...renderArenaScaleSweepOverview(snapshot.scaleSweep),
	];
};

const renderArenaScaleSweepOverview = (sweep: ArenaScaleSweep | undefined): string[] => {
	if (sweep === undefined) return [];
	const slope = (measurements: readonly ArenaScaleMeasurement[]): string => {
		const base = measurements.find(({ styles }) => styles === 0);
		const at800 = measurements.find(({ styles }) => styles === 800);
		if (base === undefined || at800 === undefined) return "—";
		return (
			(at800.brotli11Bytes - base.brotli11Bytes) /
			(800 * sweep.declarationsPerStyle)
		).toFixed(2);
	};
	const tradeoffs = sweep.namedAtomTradeoffs;
	return [
		`The corrected all-distinct 800-style sweep measured ${tradeoffs.hashBrotliSlopePerDeclaration.toFixed(2)} Brotli B/declaration for YumCSS hash classes, compared with ${slope(sweep.measurements.bamboo)} for Bamboo and ${slope(sweep.measurements.panda)} for Panda. Named atoms reached ${tradeoffs.namedAtomBrotliSlopePerDeclaration.toFixed(2)} B/declaration, but raised the Bench page from ${integer(tradeoffs.benchPageHashGzipBytes)} B to ${integer(tradeoffs.benchPageNamedAtomsGzipBytes)} B gzip and added ${integer(tradeoffs.arenaClassAttributeRawBytesAdded)} raw class-attribute bytes. Keep hash classes as the default; see the full CSS byte breakdown in [PERF.md](PERF.md#css-in-js-arena-detailed-results).`,
		"",
	];
};

const renderArenaOutputVerificationOverview = (snapshot: ArenaSnapshot): string[] => {
	const verification = snapshot.outputVerification;
	if (verification === undefined) return [];
	const javascript = verification.metrics.find(
		({ label }) => label === "Client JavaScript, Brotli",
	);
	const fullFirstLoad = verification.metrics.find(({ label }) => label === "Full first load");
	const pinnedJavascript = snapshot.metrics.find(
		({ label }) => label === "Client JavaScript, Brotli",
	);
	const pinnedFullFirstLoad = snapshot.metrics.find(({ label }) => label === "Full first load");
	if (
		javascript === undefined ||
		fullFirstLoad === undefined ||
		pinnedJavascript === undefined ||
		pinnedFullFirstLoad === undefined
	) {
		throw new Error("Arena output verification is missing required transfer metrics");
	}
	const javascriptDelta = javascript.value - pinnedJavascript.values.yumcss;
	const fullFirstLoadDelta = fullFirstLoad.value - pinnedFullFirstLoad.values.yumcss;
	const parity = verification.parity;
	return [
		"Current-source output recheck: YumCSS revision " +
			verification.yumcssRevision +
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
			throw new Error(
				"Arena output verification metric is missing from the pinned snapshot: " + metric.label,
			);
		}
		const ranked = arenaLibraries
			.map((library) => ({
				...library,
				value: library.id === "yumcss" ? metric.value : pinnedMetric.values[library.id],
			}))
			.toSorted((left, right) => left.value - right.value || left.label.localeCompare(right.label));
		const rank = ranked.findIndex(({ id }) => id === "yumcss") + 1;
		const delta = metric.value - pinnedMetric.values.yumcss;
		return [
			metric.label,
			formatArenaValue(pinnedMetric.values.yumcss, metric.unit),
			formatArenaValue(metric.value, metric.unit),
			(delta > 0 ? "+" : "") + delta + " B",
			"#" + rank + "/4",
		];
	});
	const parity = verification.parity;
	return [
		"### Current-source output recheck",
		"",
		"YumCSS revision " +
			verification.yumcssRevision +
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
			"%. Rankings use the pinned peer values, with the current YumCSS output substituted.",
		"",
		markdownTable(
			["Output measure", "Pinned YumCSS", "Current YumCSS", "Delta", "Rank"],
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
		`Source revisions: Arena ${snapshot.source.arenaRevision}, YumCSS ${snapshot.source.yumcssRevision}. Measured ${snapshot.source.measuredAt} on ${snapshot.source.environment}. Geometry passed ${parity.geometryPassed}/${parity.geometryTotal} route checks within ${parity.geometryThresholdPx} px; screenshots passed ${parity.screenshotsPassed}/${parity.screenshotsTotal} within ${parity.screenshotThresholdPercent}%. Maximum screenshot difference: YumCSS ${parity.yumcssMaxImageDifferencePercent}%, all lanes ${parity.maxImageDifferencePercent}%. Each metric is ranked independently, lower is better, and there is no composite score.`,
		"",
		markdownTable(["Category", "Measure", "Rank 1", "Rank 2", "Rank 3", "Rank 4"], rows, new Set()),
		"",
		`Full normalized measurements and parity metadata: [snapshot.json](benchmarks/css-in-js-arena/snapshot.json).`,
		"",
		...renderArenaOutputVerificationDetails(snapshot),
		...renderArenaScaleSweepDetails(snapshot.scaleSweep),
	];
};

const renderArenaScaleSweepDetails = (sweep: ArenaScaleSweep | undefined): string[] => {
	if (sweep === undefined) return [];
	const measurementGroups = [
		{ label: "Bamboo", rows: sweep.measurements.bamboo },
		{ label: "StyleX", rows: sweep.measurements.stylex },
		{ label: "Panda", rows: sweep.measurements.panda },
		{ label: "YumCSS hash", rows: sweep.measurements.yumcssHash },
		{ label: "YumCSS named atoms", rows: sweep.measurements.yumcssNamedAtoms },
	];
	const measurementRows = measurementGroups.flatMap(({ label, rows }) =>
		rows.map((measurement) => [
			label,
			integer(measurement.styles),
			integer(measurement.rawBytes),
			integer(measurement.gzip9Bytes),
			integer(measurement.brotli11Bytes),
			integer(measurement.blocks),
		]),
	);
	const slopeRows = measurementGroups.map(({ label, rows }) => {
		const base = rows.find(({ styles }) => styles === 0);
		const at800 = rows.find(({ styles }) => styles === 800);
		const slope =
			base === undefined || at800 === undefined
				? "—"
				: `${((at800.brotli11Bytes - base.brotli11Bytes) / (800 * sweep.declarationsPerStyle)).toFixed(2)} B / declaration`;
		return [label, slope];
	});
	const { growth } = sweep.yumcssHashGrowthBreakdown;
	const growthRows = [
		["Class-name characters", integer(growth.classNameRawBytes)],
		["Other selector syntax", integer(growth.selectorSyntaxRawBytes)],
		["Declaration text", integer(growth.declarationRawBytes)],
		["Rule syntax", integer(growth.ruleSyntaxRawBytes)],
		["Inter-rule whitespace", integer(growth.interRuleWhitespaceRawBytes)],
	];
	const tradeoffs = sweep.namedAtomTradeoffs;
	return [
		"### Large-style CSS volume sweep",
		"",
		`Measured ${sweep.measuredAt} with Arena ${sweep.arenaRevision} and YumCSS ${sweep.yumcssRevision}. Each run links ${integer(sweep.stylesPerRun.at(-1) ?? 0)} style definitions, each containing ${integer(sweep.declarationsPerStyle)} CSS properties, into the same four applications. The corrected harness gives each property unique values across the 800-style run; the repeatable patch is [unique-scale-fixture.patch](benchmarks/css-in-js-arena/unique-scale-fixture.patch). Each engine is measured from its own zero-style baseline because framework overhead differs.`,
		"",
		markdownTable(
			["Engine / strategy", "Styles", "Raw CSS", "gzip-9", "Brotli-11", "CSS blocks"],
			measurementRows,
			new Set([1, 2, 3, 4]),
		),
		"",
		"The 800-style Brotli growth, after subtracting each engine's zero-style output, was:",
		"",
		markdownTable(["Engine / strategy", "Brotli growth per declaration"], slopeRows, new Set()),
		"",
		`The default hash lane adds ${integer(sweep.yumcssHashGrowthBreakdown.growth.brotli11Bytes)} Brotli bytes across ${integer(sweep.yumcssHashGrowthBreakdown.declarationInputs)} unique declarations (${sweep.namedAtomTradeoffs.hashBrotliSlopePerDeclaration.toFixed(2)} B per declaration). Its raw increase is accounted for exactly by class names, selector syntax, declaration text, rule syntax, and line separation below. These raw categories are additive; Brotli and gzip are not, so their growth is measured on complete emitted assets.`,
		"",
		markdownTable(["Raw CSS component", "Bytes"], growthRows, new Set([1])),
		"",
		`The added rules stay in the existing ${growth.sharedLayerContext} context. They add ${integer(growth.newConditionWrappers)} conditional wrappers and ${integer(growth.newLayerWrapperBytes)} layer-wrapper bytes.`,
		"",
		`Named atoms lower the synthetic 800-style CSS slope from ${tradeoffs.hashBrotliSlopePerDeclaration.toFixed(2)} to ${tradeoffs.namedAtomBrotliSlopePerDeclaration.toFixed(2)} Brotli bytes per declaration; their 17,763 B output edges Bamboo's 17,833 B by 70 B at this volume. The strict experimental ≤2.00 B/declaration assertion exits nonzero at the measured 2.014 B/declaration (displayed as 2.0). On the ordinary 400-tile Bench page, named atoms raise transfer from ${integer(tradeoffs.benchPageHashGzipBytes)} B to ${integer(tradeoffs.benchPageNamedAtomsGzipBytes)} B gzip and add ${integer(tradeoffs.arenaClassAttributeRawBytesAdded)} raw class-attribute bytes across Arena routes. Keep hash classes as the default.`,
		"",
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
	const css = snapshot.clientAssets.mainYumCSSStylesheet;
	const memoryValues = snapshot.emisoup.afterMaxResidentBytes.map((value) =>
		(value / 1_000_000_000).toFixed(2),
	);
	const recheck = snapshot.currentBuildRecheck;
	const sourceFilterComparison = snapshot.sourceFilterComparison;
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
						", YumCSS source " +
						recheck.source.yumcssRevision +
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
	const sourceFilterDetails =
		sourceFilterComparison === undefined
			? []
			: renderSourceFilterComparisonDetails(sourceFilterComparison);
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
			"; YumCSS before scan gate " +
			snapshot.source.yumcssBeforeRevision +
			"; after " +
			snapshot.source.yumcssAfterRevision +
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
		...sourceFilterDetails,
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
		"The main YumCSS stylesheet is " +
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
		"Arena's shared JavaScript remains attributed to YumCSS runtime, preset, cx, and app modules; the measured fold changed none of the six route modules. No JavaScript was removed. Route splitting remains opt-in without first-paint and client-navigation evidence; hashed class names remain the default.",
		"",
	];
};

const renderSourceFilterComparisonDetails = (comparison: SourceFilterComparison): string[] => {
	const emisoup = comparison.fullBuilds.emisoup;
	const playground = comparison.fullBuilds.playground;
	const profile = comparison.instrumentedEmisoupApiProfile;
	const filterDisabled = profile.filterDisabled;
	const filterEnabled = profile.filterEnabled;
	const generateBundleBeforeMedian = median(filterDisabled.cssGenerateBundleSeconds);
	const generateBundleAfterMedian = median(filterEnabled.cssGenerateBundleSeconds);
	const generateBundleImprovementPercent =
		(1 - generateBundleAfterMedian / generateBundleBeforeMedian) * 100;
	return [
		"### Source eligibility filtering in production bundle extraction",
		"",
		"A production-bundle regression reproduced: an excluded bundled module contributed CSS because its ID reached CSS collection without the same include/exclude gate used during source transforms. The fix exposes `CssSourceWorkspace.isScanned(file)` as the shared eligibility check and applies it before main, split, and critical CSS collection.",
		"",
		`Measured ${comparison.measuredAt} on ${comparison.environment.machine}, Node ${comparison.environment.node}, with Emisoup Vite ${comparison.environment.emisoupVite} and Playground Vite ${comparison.environment.playgroundVite}. Emisoup source ${comparison.source.emisoupRevision}; baseline YumCSS ${comparison.source.baselineYumCSSRevision}; filtered YumCSS ${comparison.source.filteredYumCSSRevision}.`,
		"",
		markdownTable(
			[
				"Workload",
				"Command",
				"Before full-build samples",
				"After full-build samples",
				"Before process-tree RSS",
				"After process-tree RSS",
			],
			[
				[
					"Emisoup",
					"`" + emisoup.command + "`",
					formatBuildWallSamples(emisoup.beforeBuildSeconds),
					formatBuildWallSamples(emisoup.afterBuildSeconds),
					formatProcessTreeRssSamples(emisoup.beforePeakProcessTreeRssMiB),
					formatProcessTreeRssSamples(emisoup.afterPeakProcessTreeRssMiB),
				],
				[
					"Playground",
					"`" + playground.command + "`",
					formatBuildWallSamples(playground.beforeBuildSeconds),
					formatBuildWallSamples(playground.afterBuildSeconds),
					formatProcessTreeRssSamples(playground.beforePeakProcessTreeRssMiB),
					formatProcessTreeRssSamples(playground.afterPeakProcessTreeRssMiB),
				],
			],
			new Set(),
		),
		"",
		`RSS sums pnpm and descendant processes, sampled every ${comparison.processTreeRssSampleIntervalMs} ms. The full-process medians were ${median(emisoup.beforeBuildSeconds).toFixed(2)} s → ${median(emisoup.afterBuildSeconds).toFixed(2)} s for Emisoup and ${median(playground.beforeBuildSeconds).toFixed(2)} s → ${median(playground.afterBuildSeconds).toFixed(2)} s for Playground. The ranges overlap; these samples show no repeatable end-to-end build or memory win.`,
		"",
		`A separate instrumented Emisoup Vite API profile used ${profile.runsPerMode} sequential builds per mode in one Node process. CSS transform ran ${integer(profile.cssTransformCallsPerRun)} times per run; cumulative transform timings are inclusive and can overlap.`,
		"",
		markdownTable(
			["Profile measure", "Filter disabled", "Filter enabled"],
			[
				[
					"Build API wall time",
					formatBuildWallSamples(filterDisabled.buildSeconds),
					formatBuildWallSamples(filterEnabled.buildSeconds),
				],
				[
					"CSS transform inclusive time",
					formatBuildWallSamples(filterDisabled.cssTransformInclusiveSeconds),
					formatBuildWallSamples(filterEnabled.cssTransformInclusiveSeconds),
				],
				[
					"CSS generateBundle time",
					formatBuildWallSamples(filterDisabled.cssGenerateBundleSeconds),
					formatBuildWallSamples(filterEnabled.cssGenerateBundleSeconds),
				],
			],
			new Set(),
		),
		"",
		`The generateBundle median fell from ${generateBundleBeforeMedian.toFixed(3)} s to ${generateBundleAfterMedian.toFixed(3)} s (about ${generateBundleImprovementPercent.toFixed(0)}%) in this warm, instrumented profile. Samples are cache-sensitive and their ranges overlap; this is targeted hook evidence, not a full-build speedup. The change fixes the excluded-source leak. Arena's current-output recheck preserves its measured metrics; the Bench ranking remains tied to its pinned measured artifact and was not rerun here.`,
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
	const css = snapshot.clientAssets.mainYumCSSStylesheet;
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
		...renderSourceFilterComparisonOverview(snapshot.sourceFilterComparison),
		"All emitted Emisoup client assets total " +
			integer(snapshot.clientAssets.total.rawBytes) +
			" raw, " +
			integer(snapshot.clientAssets.total.gzip9Bytes) +
			" gzip-9, and " +
			integer(snapshot.clientAssets.total.brotli11Bytes) +
			" Brotli-11 bytes with each file compressed separately. The main YumCSS CSS asset is " +
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
			" and YumCSS source " +
			recheck.source.yumcssRevision +
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

const renderSourceFilterComparisonOverview = (
	comparison: RealWorldCssExtractionSnapshot["sourceFilterComparison"],
): string[] => {
	if (comparison === undefined) return [];
	const beforeMedian = median(
		comparison.instrumentedEmisoupApiProfile.filterDisabled.cssGenerateBundleSeconds,
	);
	const afterMedian = median(
		comparison.instrumentedEmisoupApiProfile.filterEnabled.cssGenerateBundleSeconds,
	);
	const improvementPercent = (1 - afterMedian / beforeMedian) * 100;
	return [
		"The production source-eligibility filter also fixes excluded modules leaking into CSS extraction. An instrumented Emisoup profile measured CSS `generateBundle` at " +
			beforeMedian.toFixed(3) +
			" s before and " +
			afterMedian.toFixed(3) +
			" s after (about " +
			improvementPercent.toFixed(0) +
			"% lower across three warm runs per mode). Full-process Emisoup and Playground samples remain variable and establish no end-to-end speedup. Arena's current-output recheck preserves its measured metrics; CSS-in-JS Bench ranking remains tied to its pinned measured artifact. See the detailed comparison in [PERF.md](PERF.md#real-world-vite-extraction-emisoup-and-playground).",
		"",
	];
};

const displayLibrary = (library: string): string => {
	if (library === "yumcss") return "yumcss (inferred)";
	if (library === "yumcss-generated") return "yumcss (generated)";
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

const renderYumCSSBaselines = (
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
		"## YumCSS typecheck baselines",
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

const renderYumCSSApiRanking = (snapshot: ApiTscSnapshot | undefined): string[] => {
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
		"## YumCSS API typecheck ranking",
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

const renderTwCodegenDetails = (snapshot: TwCodegenSnapshot): string[] => {
	const artifacts = snapshot.playground.generatedArtifacts;
	const migrationRoute = snapshot.playground.migrationRoute;
	const generation = snapshot.playground.generation;
	const typecheck = snapshot.playground.typecheck;
	const rawSaved = artifacts.beforeTotalRawBytes - artifacts.afterTotalRawBytes;
	const interopRawSaved = artifacts.interopBefore.rawBytes - artifacts.interopAfter.rawBytes;
	const interopGzipSaved = artifacts.interopBefore.gzipBytes - artifacts.interopAfter.gzipBytes;
	const routeRawSaved = migrationRoute.beforeRawBytes - migrationRoute.afterRawBytes;
	const routeGzipSaved = migrationRoute.beforeGzipBytes - migrationRoute.afterGzipBytes;
	const peakRssMiB = (values: readonly number[]): string =>
		values.map((value) => (value / 1_048_576).toFixed(1)).join(", ") + " MiB";
	const tscMetrics = (metrics: Metrics): string =>
		integer(metrics.instantiations) +
		" instantiations; " +
		integer(metrics.memoryUsedKiB) +
		" KiB; " +
		seconds(metrics.checkTimeSeconds) +
		" s check";
	return [
		"## Generated Tailwind project metadata",
		"",
		"Measured " +
			snapshot.measuredAt +
			" on " +
			snapshot.environment.machine +
			" with Node " +
			snapshot.environment.node +
			", Tailwind CSS " +
			snapshot.environment.tailwindCss +
			", TypeScript " +
			snapshot.environment.typescript +
			", and Vite " +
			snapshot.environment.vite +
			". Before YumCSS revision " +
			snapshot.source.beforeYumCSSRevision +
			"; after change " +
			snapshot.source.afterYumCSSChange +
			".",
		"",
		"The official default-only codegen produced " +
			integer(snapshot.defaultCatalogGate.utilities) +
			" utilities and " +
			integer(snapshot.defaultCatalogGate.variants) +
			" variants. Its declaration was " +
			integer(snapshot.defaultCatalogGate.typesDtsRawBytes) +
			" raw bytes; the customized Playground declaration was 142,978 bytes. The stock interop artifact was " +
			integer(snapshot.defaultCatalogGate.interopRawBytes) +
			" raw / " +
			integer(snapshot.defaultCatalogGate.interopGzipBytes) +
			" gzip bytes. The measured YumCSS package tarball was " +
			integer(snapshot.defaultCatalogGate.yumcssPackageTarballBytes) +
			" bytes.",
		"",
		"The shared default-catalog design remains a no-go: measurements do not show a lower combined package, generated-project, and TypeScript cost, and no shared type export was added. The compiler continues to load the effective project catalog through the official Tailwind loader.",
		"",
		markdownTable(
			["Measurement", "Before", "After", "Change"],
			[
				[
					"All generated project artifacts (raw)",
					integer(artifacts.beforeTotalRawBytes) + " B",
					integer(artifacts.afterTotalRawBytes) + " B",
					"-" + integer(rawSaved) + " B",
				],
				[
					"Self-contained interop artifact (raw)",
					integer(artifacts.interopBefore.rawBytes) + " B",
					integer(artifacts.interopAfter.rawBytes) + " B",
					"-" +
						integer(interopRawSaved) +
						" B (" +
						reduction(artifacts.interopBefore.rawBytes, artifacts.interopAfter.rawBytes) +
						")",
				],
				[
					"Self-contained interop artifact (gzip)",
					integer(artifacts.interopBefore.gzipBytes) + " B",
					integer(artifacts.interopAfter.gzipBytes) + " B",
					"-" +
						integer(interopGzipSaved) +
						" B (" +
						reduction(artifacts.interopBefore.gzipBytes, artifacts.interopAfter.gzipBytes) +
						")",
				],
				[
					"Playground MigrationLabPage (raw)",
					integer(migrationRoute.beforeRawBytes) + " B",
					integer(migrationRoute.afterRawBytes) + " B",
					"-" +
						integer(routeRawSaved) +
						" B (" +
						reduction(migrationRoute.beforeRawBytes, migrationRoute.afterRawBytes) +
						")",
				],
				[
					"Playground MigrationLabPage (gzip)",
					integer(migrationRoute.beforeGzipBytes) + " B",
					integer(migrationRoute.afterGzipBytes) + " B",
					"-" +
						integer(routeGzipSaved) +
						" B (" +
						reduction(migrationRoute.beforeGzipBytes, migrationRoute.afterGzipBytes) +
						")",
				],
			],
			new Set([1, 2, 3]),
		),
		"",
		"Historical prototype measurement: this compared " +
			artifacts.interopBefore.schema +
			" to " +
			artifacts.interopAfter.schema +
			" before publication. The prototype stored each generated value union once by type alias and kept utility rows as references. The current pre-launch artifact is flattened to the single yumcss.interop/1 schema, with no token sub-schema or compatibility reader. " +
			artifacts.gzipMethod +
			". The then-after bundle was verified to contain the measured prototype schema and generated utility values (" +
			(migrationRoute.containsInteropV2 && migrationRoute.containsGeneratedUtilityValues
				? "both present"
				: "verification incomplete") +
			").",
		"",
		"TypeScript diagnostics were " +
			tscMetrics(typecheck.before) +
			" before and " +
			tscMetrics(typecheck.after) +
			" after. The after run includes one additional test file and its check time is not lower; this is not a typecheck-performance claim.",
		"",
		"The full " +
			generation.command +
			" command measured " +
			formatBuildWallSamples(generation.beforeWallSeconds) +
			" before and " +
			formatBuildWallSamples(generation.afterWallSeconds) +
			" after, with peak process RSS " +
			peakRssMiB(generation.beforePeakRssBytes) +
			" before and " +
			peakRssMiB(generation.afterPeakRssBytes) +
			" after. " +
			generation.scope +
			" These samples support the size result but do not isolate generator CPU time.",
		"",
		"The CSS-in-JS Bench and Arena rankings are unchanged: this is a Playground migration-tool chunk, not a benchmarked styling lane. The static and dynamic tw() runtime paths, conflict metadata, and generated APIs remain intact.",
		"",
		"Normalized evidence: [snapshot.json](benchmarks/tw-codegen/snapshot.json).",
		"",
	];
};

const renderTwCodegenOverview = (snapshot: TwCodegenSnapshot): string[] => {
	const artifacts = snapshot.playground.generatedArtifacts;
	const route = snapshot.playground.migrationRoute;
	const routeGzipSaved = route.beforeGzipBytes - route.afterGzipBytes;
	return [
		"### Generated Tailwind tooling metadata",
		"",
		"A lossless interop v2 catalog reduced Playground's migration artifact by " +
			integer(artifacts.interopBefore.gzipBytes - artifacts.interopAfter.gzipBytes) +
			" gzip bytes and its migration route chunk by " +
			integer(routeGzipSaved) +
			" gzip bytes. The broader shared default-catalog proposal remains a no-go because the measured package and TypeScript costs did not establish a total win. These tooling measurements do not change the CSS-in-JS Bench or Arena ranks; details are in [PERF.md](PERF.md#generated-tailwind-project-metadata).",
		"",
	];
};

const ecosystemLibrary = (library: string): string =>
	({
		yumcss: "YumCSS css() (static)",
		tailwind: "Tailwind CSS",
		panda: "Panda CSS",
		stylex: "StyleX",
		"vanilla-extract": "Vanilla Extract",
		sprinkles: "Sprinkles",
		unocss: "UnoCSS",
		linaria: "Linaria",
		"yumcss-css": "YumCSS css() (dynamic)",
		"yumcss-runtime": "YumCSS createRuntimeCss()",
		"yumcss-unsafe": "YumCSS createUnsafeCss()",
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
		"Static production output ships extracted CSS. Runtime/dynamic output keeps style creation in browser JavaScript; the CSS delivery column distinguishes injected rules from YumCSS fallback lanes that require a host stylesheet.",
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

const median = (values: readonly number[]): number => {
	const sorted = [...values].toSorted((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
	const lower = sorted[middle - 1];
	const upper = sorted[middle];
	if (lower === undefined || upper === undefined) return 0;
	return (lower + upper) / 2;
};

const summarizeRuntimeApiRuns = (
	runs: RuntimeApiFollowupsSnapshot["measurements"][number]["before"]["runs"],
): string => {
	const medians = runs.map((run) => run.medianOpsPerSecond);
	return `${integer(medianOfProcessRuns(medians))} (${integer(Math.min(...medians))}–${integer(Math.max(...medians))}; ${runs.length} processes)`;
};

const renderRuntimeApiFollowups = (snapshot: RuntimeApiFollowupsSnapshot | undefined): string[] => {
	if (snapshot === undefined || snapshot.measurements.length === 0) return [];
	const rows = snapshot.measurements.map((measurement) => {
		const beforeMedian = medianOfProcessRuns(
			measurement.before.runs.map((run) => run.medianOpsPerSecond),
		);
		const afterMedian = medianOfProcessRuns(
			measurement.after.runs.map((run) => run.medianOpsPerSecond),
		);
		const changePercent = ((afterMedian / beforeMedian - 1) * 100).toFixed(1);
		const change = Number(changePercent) >= 0 ? `+${changePercent}%` : `${changePercent}%`;
		return [
			measurement.name,
			measurement.operation,
			summarizeRuntimeApiRuns(measurement.before.runs),
			summarizeRuntimeApiRuns(measurement.after.runs),
			change,
		];
	});
	const p10Before = snapshot.measurements.flatMap((measurement) =>
		measurement.before.runs.flatMap((run) => (run.p10 === undefined ? [] : [run.p10])),
	);
	const p90Before = snapshot.measurements.flatMap((measurement) =>
		measurement.before.runs.flatMap((run) => (run.p90 === undefined ? [] : [run.p90])),
	);
	const p10After = snapshot.measurements.flatMap((measurement) =>
		measurement.after.runs.flatMap((run) => (run.p10 === undefined ? [] : [run.p10])),
	);
	const p90After = snapshot.measurements.flatMap((measurement) =>
		measurement.after.runs.flatMap((run) => (run.p90 === undefined ? [] : [run.p90])),
	);
	return [
		"### Targeted runtime optimization follow-up",
		"",
		`Measured on ${snapshot.environment.platform}/${snapshot.environment.arch} with Node ${snapshot.environment.node} on ${snapshot.updatedAt}. ${snapshot.method}`,
		"",
		markdownTable(
			[
				"API",
				"Operation",
				"Before median ops/s (run range)",
				"After median ops/s (run range)",
				"Change",
			],
			rows,
			new Set([2, 3, 4]),
		),
		"",
		`The recorded within-process P10–P90 envelope was ${integer(Math.min(...p10Before))}–${integer(Math.max(...p90Before))} ops/s before (one run retained percentiles) and ${integer(Math.min(...p10After))}–${integer(Math.max(...p90After))} ops/s after. Source revisions: before ${snapshot.measurements.map((measurement) => measurement.before.revision).join(", ")}; after ${snapshot.measurements.map((measurement) => measurement.after.revision).join(", ")}. This focused runtime result does not establish a full application build win or a cross-library rank change; the all-API table above remains pinned to its recorded snapshot.`,
		"",
	];
};

const renderRuntimeApiRanking = (
	snapshot: RuntimeApiSnapshot | undefined,
	followups: RuntimeApiFollowupsSnapshot | undefined,
): string[] => {
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
		"## YumCSS runtime API throughput ranking",
		"",
		`Measured on ${snapshot.environment.platform}/${snapshot.environment.arch} with Node ${snapshot.environment.node}; snapshot updated ${snapshot.updatedAt}. Higher is better, but rows are different operations and are not a single composite score. Build-category rows measure supporting tooling and are not browser runtime costs.`,
		"",
		markdownTable(
			["Rank", "API", "Category", "Median ops/s", "P10 ops/s", "P90 ops/s"],
			rows,
			new Set([0, 3, 4, 5]),
		),
		"",
		"The dedicated runtime snapshot is [runtime-api-benchmark.json.snap](packages/yumcss/tests/snapshots/runtime-api-benchmark.json.snap); the older hot-path regression snapshot remains separate because its repeated micro-inputs and tolerance are intentionally different.",
		"",
		...renderRuntimeApiFollowups(followups),
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

const renderCssInJsBenchScopeNote = (snapshot: CssInJsBenchSnapshot): string => {
	const ssrSpread = snapshot.workloads
		.find(({ id }) => id === "ssr-throughput")
		?.results.find(({ tech }) => tech === snapshot.source.yumcssMainLane)?.spread;
	const spreadNote =
		ssrSpread === undefined
			? ""
			: ` The current YumCSS SSR median reports a ${(ssrSpread * 100).toFixed(1)}% spread.`;
	return `The CSS-in-JS Bench page does not call \`cx()\`, so it does not exercise the class-map compiler optimization.${spreadNote} Its rank measures this fixture; it is not evidence for or against the \`cx()\` change.`;
};

const renderCssInJsBenchComparison = (snapshot: CssInJsBenchSnapshot | undefined): string[] => {
	if (snapshot === undefined) return [];
	const rows = snapshot.workloads.flatMap((workload) =>
		renderRankedExternalWorkload(workload, snapshot.source.yumcssMainLane),
	);
	if (rows.length === 0) return [];
	const twBonusRows = snapshot.workloads.flatMap((workload) => {
		const peerResults = workload.results.filter(
			({ tech }) => tech !== snapshot.source.yumcssMainLane,
		);
		if (workload.bonusResults.length === 0) return [];
		return renderRankedExternalWorkload(
			{ ...workload, results: [...peerResults, ...workload.bonusResults] },
			snapshot.source.yumcssTwBonusLane,
		);
	});
	const payload = snapshot.workloads.find(({ id }) => id === "payload");
	const primaryPayload = payload?.results.find(
		({ tech }) => tech === snapshot.source.yumcssMainLane,
	);
	const namedPayload = payload?.strategyResults.find(
		({ tech }) => tech === snapshot.source.yumcssNamedStrategyDiagnostic,
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
		`A 400-tile shop page; WPD finished ${snapshot.source.wpdCompletedAt} on ${snapshot.source.host} with Node ${snapshot.source.node}, WPD ${snapshot.source.wpdVersion}, Chrome ${snapshot.source.browsers.chrome ?? "unknown"}, and Firefox ${snapshot.source.browsers.firefox ?? "unknown"}. The snapshot covers ${snapshot.source.laneCount} harness lanes and ${snapshot.source.caseCount} workloads. YumCSS source: ${snapshot.source.yumcssRevision}; CSS-in-JS Bench source: ${snapshot.source.cssInJsBenchRevision}. The primary score uses ${snapshot.source.yumcssMainLane} and non-YumCSS peers; utility and strategy diagnostics do not change that denominator. Payload is gzipped JS + CSS + HTML; browser figures are Chrome medians. Lower is better except SSR throughput.`,
		"",
		markdownTable(["Measure", "Workload", "Top five", "YumCSS `css()`"], rows, new Set()),
		"",
		"The primary lane uses `createCss(preset)` with `css.class(...)` for class-string hosts and a static multi-map `css(...)` + `css.props(...)` tile host, compiled by the shipped `yumcssExtractVite(css)` plugin. The only runtime style value is the rating percentage custom property. Values are per-metric rankings; there is no cross-category score.",
		"",
		renderCssInJsBenchScopeNote(snapshot),
		"",
		"### Separate `tw()` bonus lane",
		"",
		"This uses the same peer set with the primary `css()` row swapped for the literal `tw()` lane. It is shown separately and never changes the primary rank.",
		"",
		markdownTable(
			["Measure", "Workload", "Top five", "YumCSS `tw()` bonus"],
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

const renderCssInJsBenchParityVerification = (
	snapshot: CssInJsBenchSnapshot,
	parityReport: CssInJsBenchParityReport | undefined,
): string[] => {
	const metadata = snapshot.parityVerification;
	if (metadata === undefined) return [];
	if (parityReport === undefined) {
		throw new Error("missing CSS-in-JS Bench parity report: " + metadata.reportPath);
	}
	const domCases = parityReport.reports.filter(
		(report) => report.ok && report.notes.some((note) => note.includes("attrs clean")),
	).length;
	const pixelCases = parityReport.reports.filter(
		(report) => report.ok && report.notes.some((note) => note.startsWith("✓ pixels:")),
	).length;
	const allCasesPassed =
		parityReport.ok &&
		parityReport.reports.length === snapshot.source.caseCount &&
		domCases === snapshot.source.caseCount &&
		pixelCases === snapshot.source.caseCount;
	return [
		"### Pinned-artifact DOM and pixel verification",
		"",
		"The CSS-in-JS Bench verifier ran " +
			metadata.measuredAt +
			" against benchmark revision " +
			metadata.benchmarkRevision +
			" and YumCSS artifact " +
			metadata.yumcssArtifactRevision +
			". It passed " +
			domCases +
			"/" +
			snapshot.source.caseCount +
			" DOM-attribute cases and " +
			pixelCases +
			"/" +
			snapshot.source.caseCount +
			" pixel cases across the " +
			snapshot.source.laneCount +
			"-lane benchmark artifact" +
			(allCasesPassed ? "." : "; some checks did not pass."),
		"",
		"Hydration verification " +
			metadata.hydration +
			(metadata.hydrationNote === undefined ? "." : ": " + metadata.hydrationNote) +
			" The case-level evidence is in [parity-verification.json](" +
			metadata.reportPath +
			"). This validates the pinned artifact, not later current-source changes.",
		"",
	];
};

const renderDetailedCssInJsBenchComparison = (
	snapshot: CssInJsBenchSnapshot | undefined,
	parityReport: CssInJsBenchParityReport | undefined,
): string[] => {
	if (snapshot === undefined) return [];
	const { source } = snapshot;
	const mainLane = source.yumcssMainLane;
	const twBonusLane = source.yumcssTwBonusLane;
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
	const buildtimeSamples = source.yumcssBuildtimeSamples;
	const buildtimeProfile = source.yumcssBuildtimeProfile;
	const buildtimeContext = [
		...(buildtimeSamples === undefined
			? []
			: [
					"### Cold-build method and samples",
					"",
					"YumCSS cold runs were " +
						buildtimeSamples.coldMs.join(", ") +
						" ms (median " +
						median(buildtimeSamples.coldMs) +
						" ms); immediate warm runs were " +
						buildtimeSamples.warmMs.join(", ") +
						" ms (median " +
						median(buildtimeSamples.warmMs) +
						" ms). The repeated rank harness clears the lane's output and Vite caches, then measures the whole client build through Vite's build API in one Node process; it does not cold-start the process or operating-system caches, and it records no phase timings. Treat the 375 ms rank as a lane-level diagnostic, not as a real-project build-time comparison.",
					"",
				]),
		...(buildtimeProfile === undefined
			? []
			: [
					"### One-off instrumented phase profile",
					"",
					`One instrumented ${buildtimeProfile.harness} sample on ${buildtimeProfile.measuredAt}, using YumCSS artifact ${buildtimeProfile.yumcssRevision}, took ${buildtimeProfile.totalBuildMs.toFixed(2)} ms total. Hook timings were load ${buildtimeProfile.phasesMs.load.toFixed(2)} ms, resolve ${buildtimeProfile.phasesMs.resolve.toFixed(2)} ms, buildStart ${buildtimeProfile.phasesMs.buildStart.toFixed(2)} ms, cumulative inclusive CSS transform ${buildtimeProfile.phasesMs.cssTransformInclusive.toFixed(2)} ms, and CSS generateBundle ${buildtimeProfile.phasesMs.cssGenerateBundle.toFixed(2)} ms. This predates the source-filter fix; it is a single instrumented diagnostic, not a repeated phase breakdown or a rank measurement.`,
					"",
				]),
	];
	return [
		"## CSS-in-JS Bench detailed results",
		"",
		`WPD ${source.wpdVersion} completed ${source.wpdCompletedAt} on ${source.host} with Node ${source.node}, Chrome ${source.browsers.chrome ?? "unknown"}, and Firefox ${source.browsers.firefox ?? "unknown"}. CSS-in-JS Bench revision ${source.cssInJsBenchRevision}; YumCSS artifact revision ${source.yumcssRevision}; ${source.laneCount} lanes and ${source.caseCount} workload definitions. The CSS lane is the 400-tile product-grid case. Rankings compare ${mainLane} with non-YumCSS peer lanes; per-call JS, CSS, and SSR HTML payload components are gzip bytes. Browser measurements are Chrome medians.`,
		"",
		"### Primary `createCss` lane",
		"",
		"The lane uses `createCss(preset)`, static `css.class(...)` declarations, and a multi-map `css(...)` plus `css.props(...)` host boundary through the shipped `yumcssExtractVite(css)` plugin. Only the rating percentage remains a runtime style value.",
		renderCssInJsBenchScopeNote(snapshot),
		"",
		...primaryWorkloads,
		...buildtimeContext,
		...renderCssInJsBenchParityVerification(snapshot, parityReport),
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
	const yumcssIndex = ranked.findIndex((workload) => workload.library === "yumcss");
	const yumcss =
		yumcssIndex < 0
			? "not measured"
			: `#${yumcssIndex + 1}/${ranked.length} — ${integer(ranked[yumcssIndex]!.metrics.instantiations)} inst.; ${seconds(ranked[yumcssIndex]!.metrics.checkTimeSeconds)} s`;
	return [
		"## Consumer typecheck: natural CSS usage",
		"",
		`TypeScript ${snapshot.environment.typescript}, snapshot updated ${snapshot.updatedAt}; this is the natural-use fixture, not the synthetic stress case. Ranked by instantiations because the short check times are close to process overhead; check time remains visible for context.`,
		"",
		markdownTable(
			["Measure", "Top five", "YumCSS (inferred)"],
			[["TypeScript instantiations (check time)", topFive, yumcss]],
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
	const yumcssIndex = ranked.findIndex((workload) => workload.library === "yumcss");
	const yumcss =
		yumcssIndex < 0
			? "not measured"
			: `#${yumcssIndex + 1}/${ranked.length} — ${signedKilobytes(ranked[yumcssIndex]!.delta.total.gz)}`;
	return [
		"## Static production output size",
		"",
		`Styled app minus unstyled app baseline, gzip total, snapshot updated ${snapshot.updatedAt}. Lower is smaller.`,
		"",
		markdownTable(
			["Measure", "Top five", "YumCSS"],
			[["Static output delta", topFive, yumcss]],
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
	const twCodegen = readJson<TwCodegenSnapshot>(twCodegenSnapshotPath);
	if (twCodegen === undefined || twCodegen.schemaVersion !== 1) {
		throw new Error("missing or unsupported " + twCodegenSnapshotPath);
	}
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
		"# YumCSS performance overview",
		"",
		"Quick view of the main API and real-world workload comparisons. For complete measurements, synthetic stress cases, snapshots, and methodology, see [PERF.md](PERF.md). Rankings are per metric; there is no single score across unlike workloads.",
		"",
		...renderNaturalTypecheckRanking(styling),
		...renderStaticBundleRanking(ecosystemBundleSizes),
		...renderCssInJsBenchComparison(cssInJsBench),
		...renderArenaComparison(arena),
		...renderTwCodegenOverview(twCodegen),
		...renderRealWorldCssExtractionOverview(realWorldCssExtraction),
		"## Benchmark cadence",
		"",
		"Run focused regression benchmarks with changes to the compiler, runtime, public API, or bundler plugin paths they cover. Refresh the full local comparison before releases and monthly while performance work is active. Refresh external CSS-in-JS Bench/Arena comparisons quarterly, or sooner when a benchmarked library or its major version changes. A JJ revision by itself is not a reason to rerun the full matrix.",
		"",
		"## Refresh",
		"",
		"1. Run the local commands listed at the end of [PERF.md](PERF.md).",
		"2. In a separate CSS-in-JS Bench checkout, run `pnpm gen:samples --measure=microbench,payload,buildtime`, then `pnpm gen:wpd`, `pnpm verify`, and `pnpm report`.",
		"3. In CSS-in-JS Arena, refresh the pinned YumCSS tarball, pass the six-route geometry and screenshot gates, then run the byte, build, dev-start, four-sweep HMR, and scale measurements. Apply [the unique-scale fixture patch](benchmarks/css-in-js-arena/unique-scale-fixture.patch) before `tools/scale.mjs`; keep parity and source revisions with the results.",
		"4. Import `BENCHMARK.json` with `node scripts/import-css-in-js-bench.mjs /path/to/BENCHMARK.json <yumcss-commit>`, update `benchmarks/css-in-js-arena/snapshot.json`, then run `pnpm run bench:summary` and `pnpm run bench:summary:check`.",
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
	const runtimeApiFollowups = readJson<RuntimeApiFollowupsSnapshot>(
		runtimeApiFollowupsSnapshotPath,
	);
	if (runtimeApiFollowups !== undefined && runtimeApiFollowups.schemaVersion !== 1) {
		throw new Error(`missing or unsupported ${runtimeApiFollowupsSnapshotPath}`);
	}
	const runtimeSizes = readJson<Record<string, BundleSize>>(runtimeSizeSnapshotPath);
	const generatedRuntimeSizes = readJson<Record<string, BundleSize>>(
		generatedRuntimeSizeSnapshotPath,
	);
	const ecosystemBundleSizes = readJson<EcosystemBundleSnapshot>(ecosystemBundleSizeSnapshotPath);
	const cssInJsBench = readJson<CssInJsBenchSnapshot>(cssInJsBenchSnapshotPath);
	const cssInJsBenchParity = readJson<CssInJsBenchParityReport>(cssInJsBenchParityReportPath);
	const arena = readJson<ArenaSnapshot>(arenaSnapshotPath);
	const twCodegen = readJson<TwCodegenSnapshot>(twCodegenSnapshotPath);
	if (twCodegen === undefined || twCodegen.schemaVersion !== 1) {
		throw new Error("missing or unsupported " + twCodegenSnapshotPath);
	}
	const realWorldCssExtraction = readJson<RealWorldCssExtractionSnapshot>(
		realWorldCssExtractionSnapshotPath,
	);
	if (realWorldCssExtraction === undefined || realWorldCssExtraction.schemaVersion !== 1) {
		throw new Error(`missing or unsupported ${realWorldCssExtractionSnapshotPath}`);
	}
	const lines = [
		"<!-- Generated by scripts/render-performance-summary.mts; do not edit. -->",
		"",
		"# YumCSS performance details",
		"",
		"For the concise real-world comparison, see [PERF-SUMMARY.md](PERF-SUMMARY.md). This detailed report includes committed typecheck, runtime-throughput, bundle-size, generated Tailwind metadata, CSS-in-JS Bench, and Arena snapshots. Lower is better for typecheck/size; higher is better for throughput. Rankings are per workload and metric, not a universal library score.",
		"",
		"TypeScript measurements use fresh processes and the pinned TypeScript version in each benchmark. Runtime-throughput measurements are local in-process calls. Runtime-size measurements are minified browser bundles with gzip level 6.",
		"",
		...renderYumCSSBaselines(packageSnapshot, exampleSnapshot, apiSnapshot),
		...renderYumCSSApiRanking(apiSnapshot),
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
	lines.push(...renderRuntimeApiRanking(runtimeApiSnapshot, runtimeApiFollowups));
	lines.push(...renderBundleRanking(runtimeSizes));
	lines.push(...renderGeneratedRuntimeSizes(generatedRuntimeSizes));
	lines.push(...renderTwCodegenDetails(twCodegen));
	lines.push(...renderEcosystemBundleComparison(ecosystemBundleSizes));
	lines.push(...renderDetailedCssInJsBenchComparison(cssInJsBench, cssInJsBenchParity));
	lines.push(...renderArenaDetails(arena));
	lines.push(...renderRealWorldCssExtractionDetails(realWorldCssExtraction));
	lines.push(
		"## External benchmark refresh",
		"",
		"After refreshing CSS-in-JS Bench in a separate checkout, import its generated report with `node scripts/import-css-in-js-bench.mjs /path/to/BENCHMARK.json <yumcss-commit>`. Update the [CSS-in-JS Arena snapshot](benchmarks/css-in-js-arena/snapshot.json) only after its YumCSS lane passes the six-page parity gates; that snapshot drives the Arena rankings in PERF-SUMMARY.md.",
		"",
	);
	lines.push(
		"## Sources and refresh commands",
		"",
		"- Generated Tailwind metadata: run pnpm --filter playground run tw:generate and pnpm --filter playground run build, then update benchmarks/tw-codegen/snapshot.json",
		"- Typecheck ecosystem: `pnpm run bench:tsc:styling -- --update`",
		"- Generated facade comparison: `pnpm run bench:tsc:generated -- --update`",
		"- Package/example typecheck: `pnpm run bench:tsc -- --update` and `pnpm run bench:tsc:example -- --update`",
		"- Public API typecheck: `pnpm --filter yumcss run test:tsc -- -u`",
		"- Runtime size: `pnpm --filter yumcss exec vitest run runtime-size -u`",
		"- Runtime API throughput: `pnpm --filter yumcss run test:benchmarks -- -u`",
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
