import {
	analyzeSource,
	collectFiles,
	loadTwConfig,
	summarize,
	type AnalyzeOptions,
	type FileFoldStats,
	type FoldSummary,
} from "./analyze.ts";

export interface FoldAnalysisPort {
	analyze(source: string, file: string, options: AnalyzeOptions): FileFoldStats;
	summarize(files: Array<FileFoldStats>): FoldSummary;
}

class FoldAnalysisService implements FoldAnalysisPort {
	analyze(source: string, file: string, options: AnalyzeOptions): FileFoldStats {
		return analyzeSource(source, file, options);
	}

	summarize(files: Array<FileFoldStats>): FoldSummary {
		return summarize(files);
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
