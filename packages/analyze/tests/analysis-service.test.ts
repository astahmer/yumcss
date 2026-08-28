import { describe, expect, test } from "vitest";
import {
	createFoldAnalysisService,
	type FileFoldAnalyzerPort,
	type FoldReportPort,
	type FoldSummaryPort,
} from "../src/analysis-service.ts";
import type { FileFoldStats, FoldSummary } from "../src/analyze.ts";

const stats: FileFoldStats = {
	file: "fixture.tsx",
	eliminatedPct: 100,
	cxCalls: 1,
	cxFoldedFull: 1,
	cxFoldedPartial: 0,
	cxRuntime: 0,
	runtimeSites: [],
	missingCss: [],
	arbitraryValues: [],
	twCalls: 0,
	twFolded: 0,
};

const summary: FoldSummary = {
	files: [stats],
	totalCxCalls: 1,
	fullFolded: 1,
	partialFolded: 0,
	runtimeCalls: 0,
	eliminatedPct: 100,
	totalTwCalls: 0,
	twFolded: 0,
	filesEliminated: 1,
	filesWithCalls: 1,
	entryEliminatedPct: 100,
	totalMissingCss: 0,
	totalArbitraryValues: 0,
};

describe("analysis composition ports", () => {
	test("orchestration accepts substituted analyzer, summary, and report policies", () => {
		const calls: string[] = [];
		const analyzer: FileFoldAnalyzerPort = { analyze: () => { calls.push("analyze"); return stats; } };
		const summaryPolicy: FoldSummaryPort = { summarize: () => { calls.push("summarize"); return summary; } };
		const report: FoldReportPort = { format: () => { calls.push("format"); return "fake report"; } };
		const service = createFoldAnalysisService({
			analyzer,
			summary: summaryPolicy,
			report,
		});
		expect(service.analyze("", "fixture.tsx", {} as never)).toBe(stats);
		expect(service.summarize([stats])).toBe(summary);
		expect(service.format(summary)).toBe("fake report");
		expect(calls).toEqual(["analyze", "summarize", "format"]);
	});
});
