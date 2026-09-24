import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = process.argv[2];
const pandwindRevision = process.argv[3];

if (inputPath === undefined || pandwindRevision === undefined) {
	throw new Error(
		"usage: node scripts/import-css-in-js-bench.mjs /path/to/BENCHMARK.json <pandwind-commit>",
	);
}

const report = JSON.parse(readFileSync(resolve(inputPath), "utf8"));
const productGrid = report.cases?.find(({ caseId }) => caseId === "product-grid");

if (report.schemaVersion !== 1 || productGrid === undefined || report.wpdVersion === undefined) {
	throw new Error(
		"input must be a complete CSS-in-JS Bench report with product-grid and WPD results",
	);
}

const toResults = (items, valueOf) =>
	items
		.map((item) => ({
			tech: item.tech,
			label: item.label,
			value: valueOf(item),
			...(item.spread === undefined ? {} : { spread: item.spread }),
			...(item.p95Ms === undefined ? {} : { p95Ms: item.p95Ms }),
		}))
		.filter(({ value }) => Number.isFinite(value) && value > 0);

const wpdResults = (group) => toResults(group?.wpd ?? [], ({ medianMs }) => medianMs ?? Number.NaN);

const workloads = [
	{
		id: "ssr-throughput",
		label: "SSR throughput",
		unit: "tiles/s",
		direction: "higher",
		caseId: "product-grid",
		results: toResults(productGrid.microbench ?? [], ({ value }) => value),
	},
	{
		id: "payload",
		label: "Transferred page payload",
		unit: "gzip bytes",
		direction: "lower",
		caseId: "product-grid",
		results: (productGrid.payload ?? [])
			.map(({ tech, label, total, values }) => ({
				tech,
				label,
				value: total,
				payload: { js: values[0], css: values[1], html: values[2] },
			}))
			.filter(({ value }) => Number.isFinite(value) && value > 0),
	},
	{
		id: "mount",
		label: "Chrome client mount",
		unit: "ms",
		direction: "lower",
		caseId: "product-grid",
		results: wpdResults(productGrid.mount),
	},
	{
		id: "hydrate",
		label: "Chrome hydration",
		unit: "ms",
		direction: "lower",
		caseId: "product-grid",
		results: wpdResults(productGrid.hydrate),
	},
	{
		id: "inp",
		label: "Chrome interaction responsiveness",
		unit: "ms",
		direction: "lower",
		caseId: "product-grid",
		results: wpdResults(productGrid.inp),
	},
	{
		id: "cold-build",
		label: "Cold production client build",
		unit: "ms",
		direction: "lower",
		caseId: "all cases",
		results: toResults(report.buildtime ?? [], ({ coldMs }) => coldMs),
	},
];

for (const workload of workloads) {
	if (!workload.results.some(({ tech }) => tech === "pandwind-buildtime")) {
		throw new Error(`required Pandwind build-time lane missing from ${workload.id}`);
	}
	if (workload.results.length < 5) {
		throw new Error(`fewer than five benchmark lanes have valid ${workload.id} results`);
	}
}

const snapshot = {
	schemaVersion: 1,
	source: {
		repository: "jantimon/css-in-js-bench",
		url: "https://github.com/jantimon/css-in-js-bench",
		cssInJsBenchRevision: report.meta.gitSha,
		pandwindRevision,
		wpdCompletedAt: report.meta.timestamp,
		host: report.meta.host,
		node: report.meta.node,
		gitSha: report.meta.gitSha,
		wpdVersion: report.wpdVersion,
		browsers: report.meta.browsers ?? {},
		laneCount: Object.keys(report.techs).length,
		caseCount: report.cases.length,
	},
	workloads,
};

const outputPath = resolve(root, "benchmarks/css-in-js-bench/snapshot.json");
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(snapshot, null, "\t")}\n`);
process.stdout.write(`Imported ${workloads.length} product-grid metrics into ${outputPath}\n`);
