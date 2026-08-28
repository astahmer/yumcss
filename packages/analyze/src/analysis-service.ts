import {
	analyzeSource,
	collectFiles,
	loadTwConfig,
	summarize,
	formatReport,
	type AnalyzeOptions,
	type FileFoldStats,
	type FoldSummary,
} from "./analyze.ts";
import { CssBudgetEvaluator, type CssBudget } from "./css-budget-evaluator.ts";
import { CssBudgetReportRenderer } from "./css-budget-report.ts";

export interface FoldAnalysisPort {
	analyze(source: string, file: string, options: AnalyzeOptions): FileFoldStats;
	summarize(files: Array<FileFoldStats>): FoldSummary;
	format(summary: FoldSummary): string;
}

export interface FileFoldAnalyzerPort {
	analyze(source: string, file: string, options: AnalyzeOptions): FileFoldStats;
}

export interface FoldSummaryPort {
	summarize(files: Array<FileFoldStats>): FoldSummary;
}

export interface FoldReportPort {
	format(summary: FoldSummary): string;
}

export interface FoldAnalysisDependencies {
	readonly analyzer?: FileFoldAnalyzerPort;
	readonly summary?: FoldSummaryPort;
	readonly report?: FoldReportPort;
}

class FoldAnalysisService implements FoldAnalysisPort {
	constructor(
		private readonly analyzer: FileFoldAnalyzerPort = { analyze: analyzeSource },
		private readonly summary: FoldSummaryPort = { summarize },
		private readonly report: FoldReportPort = { format: formatReport },
	) {}

	analyze(source: string, file: string, options: AnalyzeOptions): FileFoldStats {
		return this.analyzer.analyze(source, file, options);
	}

	summarize(files: Array<FileFoldStats>): FoldSummary {
		return this.summary.summarize(files);
	}

	format(summary: FoldSummary): string {
		return this.report.format(summary);
	}
}

export interface CssBudgetPort {
	measure(options: Parameters<CssBudgetEvaluator["measure"]>[0]): Promise<CssBudget>;
	format(budget: CssBudget): string;
}

export interface CssBudgetDependencies {
	readonly evaluator?: Pick<CssBudgetEvaluator, "measure">;
	readonly renderer?: Pick<CssBudgetReportRenderer, "format">;
}

class CssBudgetService implements CssBudgetPort {
	constructor(
		private readonly evaluator: Pick<CssBudgetEvaluator, "measure"> = new CssBudgetEvaluator(),
		private readonly renderer: Pick<
			CssBudgetReportRenderer,
			"format"
		> = new CssBudgetReportRenderer(),
	) {}

	measure(options: Parameters<CssBudgetEvaluator["measure"]>[0]): Promise<CssBudget> {
		return this.evaluator.measure(options);
	}

	format(budget: CssBudget): string {
		return this.renderer.format(budget);
	}
}

export interface AnalysisWorkspacePort {
	loadConfig(twPath: string): ReturnType<typeof loadTwConfig>;
	collectFiles(patterns: Array<string>, root: string): Array<string>;
}

class DefaultAnalysisWorkspace implements AnalysisWorkspacePort {
	loadConfig(twPath: string): ReturnType<typeof loadTwConfig> {
		return loadTwConfig(twPath);
	}

	collectFiles(patterns: Array<string>, root: string): Array<string> {
		return collectFiles(patterns, root);
	}
}

export const createFoldAnalysisService = (
	dependencies: FoldAnalysisDependencies = {},
): FoldAnalysisPort =>
	new FoldAnalysisService(
		dependencies.analyzer ?? { analyze: analyzeSource },
		dependencies.summary ?? { summarize },
		dependencies.report ?? { format: formatReport },
	);
export const createAnalysisWorkspace = (): AnalysisWorkspacePort => new DefaultAnalysisWorkspace();
export const createCssBudgetService = (dependencies: CssBudgetDependencies = {}): CssBudgetPort =>
	new CssBudgetService(dependencies.evaluator, dependencies.renderer);
