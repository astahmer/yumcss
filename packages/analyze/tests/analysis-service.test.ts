import { describe, expect, test } from "vitest";
import { parse } from "postcss";
import {
	createFoldAnalysisService,
	createCssBudgetService,
	type FileFoldAnalyzerPort,
	type FoldReportPort,
	type FoldSummaryPort,
} from "../src/analysis-service.ts";
import type { FileFoldStats, FoldSummary } from "../src/analyze.ts";
import type { CssResidualCollector } from "../src/css-residual-collector.ts";

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
		const analyzer: FileFoldAnalyzerPort = {
			analyze: () => {
				calls.push("analyze");
				return stats;
			},
		};
		const summaryPolicy: FoldSummaryPort = {
			summarize: () => {
				calls.push("summarize");
				return summary;
			},
		};
		const report: FoldReportPort = {
			format: () => {
				calls.push("format");
				return "fake report";
			},
		};
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

	test("default analyzer accepts a substituted residual policy", () => {
		const calls: string[] = [];
		const residuals: CssResidualCollector = {
			missingCss: () => {
				calls.push("missing");
				return [];
			},
			arbitraryValues: () => {
				calls.push("arbitrary");
				return [];
			},
		};
		const service = createFoldAnalysisService({ residuals });
		service.analyze(`cx("text-red-500")`, "fixture.tsx", {
			config: { variants: {}, conflicts: {} },
		});
		expect(calls).toEqual(["missing", "arbitrary"]);
	});

	test("CSS budget service composes evaluator, renderer, and artifact inspection ports", async () => {
		const root = parse("");
		const shape = { totalRules: 0, totalBytes: 0, categories: [], specificity: [] };
		const inspection = {
			classRules: async () => [{ candidate: "fake", rules: [] }],
			sheetShape: async () => shape,
			sheetShapeFromRoot: () => shape,
		};
		const evaluator = { measure: async () => ({ ...budgetForTest }) };
		const renderer = { format: () => "fake budget" };
		const service = createCssBudgetService({ evaluator, renderer, inspection });
		expect(await service.measure({ files: [], twEntry: "tw.ts", base: "." })).toEqual(
			budgetForTest,
		);
		expect(service.format(budgetForTest)).toBe("fake budget");
		expect(await service.classRules({ files: [], twEntry: "tw.ts", base: "." })).toEqual([
			{ candidate: "fake", rules: [] },
		]);
		expect(await service.sheetShape({ files: [], twEntry: "tw.ts", base: "." })).toBe(shape);
		expect(service.sheetShapeFromRoot(root)).toBe(shape);
	});
});

const budgetForTest = {
	liveCandidates: 1,
	deadCandidates: 0,
	deadSample: [],
	cssBytes: 1,
	cssGzipBytes: 1,
	rules: 1,
	componentScopeRules: 0,
	perPrefix: [],
	themeScopes: [],
};
