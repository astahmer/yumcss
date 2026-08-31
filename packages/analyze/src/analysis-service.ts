import {
	analyzeSource,
	loadTwConfig,
	summarize,
	formatReport,
	type AnalyzeOptions,
	type FileFoldStats,
	type FoldSummary,
} from "./analyze.ts";
import { SOURCE_SCANNER_SERVICE } from "pandwind/source";
import { createSourceWorkspace } from "pandwind/source/workspace";
import type { CssResidualCollector } from "./css-residual-collector.ts";
import { CssBudgetEvaluator } from "./css-budget-evaluator.ts";
import type { CssBudget } from "./css-budget-contracts.ts";
import { CssBudgetReportRenderer } from "./css-budget-report.ts";
import {
	TailwindCssArtifactInspection,
	type ClassDrillDown,
	type CssArtifactInspectionPort,
} from "./css-artifact-inspection.ts";
import { TailwindArtifactCompiler } from "./css-budget-compiler.ts";
import { TailwindCandidateScanner } from "./css-budget-candidates.ts";

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
	/** Residual policy used by the default source analyzer. */
	readonly residuals?: CssResidualCollector;
	readonly summary?: FoldSummaryPort;
	readonly report?: FoldReportPort;
}

class FoldAnalysisService implements FoldAnalysisPort {
	private readonly analyzer: FileFoldAnalyzerPort;
	private readonly summary: FoldSummaryPort;
	private readonly report: FoldReportPort;

	constructor(
		analyzer: FileFoldAnalyzerPort = { analyze: analyzeSource },
		summary: FoldSummaryPort = { summarize },
		report: FoldReportPort = { format: formatReport },
	) {
		this.analyzer = analyzer;
		this.summary = summary;
		this.report = report;
	}

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
	classRules(
		options: Parameters<CssBudgetEvaluator["measure"]>[0],
	): Promise<readonly ClassDrillDown[]>;
	sheetShape(options: Parameters<CssBudgetEvaluator["measure"]>[0]): Promise<SheetShape>;
	sheetShapeFromRoot(
		root: Parameters<CssArtifactInspectionPort["sheetShapeFromRoot"]>[0],
	): SheetShape;
}

type SheetShape = ReturnType<CssArtifactInspectionPort["sheetShapeFromRoot"]>;

export interface CssBudgetDependencies {
	readonly evaluator?: Pick<CssBudgetEvaluator, "measure">;
	readonly renderer?: Pick<CssBudgetReportRenderer, "format">;
	readonly inspection?: CssArtifactInspectionPort;
}

class CssBudgetService implements CssBudgetPort {
	private readonly evaluator: Pick<CssBudgetEvaluator, "measure">;
	private readonly renderer: Pick<CssBudgetReportRenderer, "format">;
	private readonly inspection: CssArtifactInspectionPort;

	constructor(
		evaluator: Pick<CssBudgetEvaluator, "measure"> = new CssBudgetEvaluator(),
		renderer: Pick<CssBudgetReportRenderer, "format"> = new CssBudgetReportRenderer(),
		inspection: CssArtifactInspectionPort = new TailwindCssArtifactInspection(
			new TailwindCandidateScanner(),
			new TailwindArtifactCompiler(),
		),
	) {
		this.evaluator = evaluator;
		this.renderer = renderer;
		this.inspection = inspection;
	}

	measure(options: Parameters<CssBudgetEvaluator["measure"]>[0]): Promise<CssBudget> {
		return this.evaluator.measure(options);
	}

	format(budget: CssBudget): string {
		return this.renderer.format(budget);
	}

	classRules(
		options: Parameters<CssBudgetEvaluator["measure"]>[0],
	): Promise<readonly ClassDrillDown[]> {
		return this.inspection.classRules(options);
	}

	sheetShape(options: Parameters<CssBudgetEvaluator["measure"]>[0]): Promise<SheetShape> {
		return this.inspection.sheetShape(options);
	}

	sheetShapeFromRoot(
		root: Parameters<CssArtifactInspectionPort["sheetShapeFromRoot"]>[0],
	): SheetShape {
		return this.inspection.sheetShapeFromRoot(root);
	}
}

export interface AnalysisWorkspacePort {
	loadConfig(twPath: string): ReturnType<typeof loadTwConfig>;
	collectFiles(patterns: readonly string[], root: string): readonly string[];
	readFiles(paths: readonly string[]): readonly { file: string; content: string }[];
}

class DefaultAnalysisWorkspace implements AnalysisWorkspacePort {
	private readonly sourceWorkspace = createSourceWorkspace();

	loadConfig(twPath: string): ReturnType<typeof loadTwConfig> {
		return loadTwConfig(twPath);
	}

	collectFiles(patterns: readonly string[], root: string): readonly string[] {
		return this.sourceWorkspace
			.files(patterns, root)
			.filter((file) => SOURCE_SCANNER_SERVICE.isTypeScriptFile(file));
	}

	readFiles(paths: readonly string[]): readonly { file: string; content: string }[] {
		return this.sourceWorkspace.read(paths).map(({ path: file, source: content }) => ({
			file,
			content,
		}));
	}
}

export const createFoldAnalysisService = (
	dependencies: FoldAnalysisDependencies = {},
): FoldAnalysisPort => {
	const analyzer =
		dependencies.analyzer ??
		({
			analyze: (source, file, options) =>
				analyzeSource(source, file, options, { residuals: dependencies.residuals }),
		} satisfies FileFoldAnalyzerPort);
	return new FoldAnalysisService(
		analyzer,
		dependencies.summary ?? { summarize },
		dependencies.report ?? { format: formatReport },
	);
};
export const createAnalysisWorkspace = (): AnalysisWorkspacePort => new DefaultAnalysisWorkspace();
export const createCssBudgetService = (dependencies: CssBudgetDependencies = {}): CssBudgetPort =>
	new CssBudgetService(dependencies.evaluator, dependencies.renderer, dependencies.inspection);
