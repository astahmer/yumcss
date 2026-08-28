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
import { cssBudget, formatCssBudget, type CssBudget } from "./css-budget.ts";

export interface FoldAnalysisPort {
	analyze(source: string, file: string, options: AnalyzeOptions): FileFoldStats;
	summarize(files: Array<FileFoldStats>): FoldSummary;
	format(summary: FoldSummary): string;
}

class FoldAnalysisService implements FoldAnalysisPort {
	analyze(source: string, file: string, options: AnalyzeOptions): FileFoldStats {
		return analyzeSource(source, file, options);
	}

	summarize(files: Array<FileFoldStats>): FoldSummary {
		return summarize(files);
	}

	format(summary: FoldSummary): string {
		return formatReport(summary);
	}
}

export interface CssBudgetPort {
	measure(options: Parameters<typeof cssBudget>[0]): Promise<CssBudget>;
	format(budget: CssBudget): string;
}

class CssBudgetService implements CssBudgetPort {
	measure(options: Parameters<typeof cssBudget>[0]): Promise<CssBudget> {
		return cssBudget(options);
	}

	format(budget: CssBudget): string {
		return formatCssBudget(budget);
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

export const createFoldAnalysisService = (): FoldAnalysisPort => new FoldAnalysisService();
export const createAnalysisWorkspace = (): AnalysisWorkspacePort => new DefaultAnalysisWorkspace();
export const createCssBudgetService = (): CssBudgetPort => new CssBudgetService();
