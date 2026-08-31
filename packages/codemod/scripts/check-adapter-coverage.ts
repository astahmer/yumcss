import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";

type CoverageMetric = { readonly pct: number };
type CoverageSummary = Readonly<
	Record<string, { readonly lines: CoverageMetric; readonly branches: CoverageMetric }>
>;

const summaryPath = resolve("coverage/coverage-summary.json");
if (!existsSync(summaryPath)) throw new Error(`coverage summary not found: ${summaryPath}`);

const summary = JSON.parse(readFileSync(summaryPath, "utf8")) as CoverageSummary;
const sourceAdapterFiles = readdirSync(resolve("src/swap/adapters"), {
	recursive: true,
})
	.filter((file) => file.endsWith(".adapter.ts"))
	.map((file) => resolve("src/swap/adapters", file));
const adapterFiles = Object.entries(summary).filter(
	([file]) => file.includes("/src/swap/adapters/") && basename(file).endsWith(".adapter.ts"),
);
const minimumLines = 50;
const minimumBranches = 30;
const failures = adapterFiles.flatMap(([file, metrics]) => {
	const reasons: string[] = [];
	if (metrics.lines.pct < minimumLines)
		reasons.push(`lines ${metrics.lines.pct}% < ${minimumLines}%`);
	if (metrics.branches.pct < minimumBranches)
		reasons.push(`branches ${metrics.branches.pct}% < ${minimumBranches}%`);
	return reasons.length === 0 ? [] : [`${file}: ${reasons.join(", ")}`];
});
for (const file of sourceAdapterFiles)
	if (summary[file] === undefined) failures.push(`${file}: no V8 coverage entry`);

if (failures.length > 0)
	throw new Error(["adapter-specific coverage gate failed", ...failures].join("\n"));

console.log(
	JSON.stringify({
		adapters: sourceAdapterFiles.length,
		minimumLines,
		minimumBranches,
		passed: true,
	}),
);
