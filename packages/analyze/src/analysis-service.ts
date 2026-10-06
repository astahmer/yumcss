import {
	analyzeSource,
	loadTwConfig,
	summarize,
	formatReport,
	type AnalyzeOptions,
	type FileFoldStats,
	type FoldSummary,
} from "./analyze.ts";
import { SOURCE_SCANNER_SERVICE } from "yumcss/source";
import { createSourceWorkspace, type SourceWorkspaceFile } from "yumcss/source/workspace";
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

export interface FoldAnalysisDependencies {
	/** Optional replacement for the complete fold-analysis policy. */
	readonly implementation?: Partial<FoldAnalysisPort>;
	/** Residual policy used by the default source analyzer. */
	readonly residuals?: CssResidualCollector;
}

class DefaultFoldAnalysis implements FoldAnalysisPort {
	constructor(private readonly residuals?: CssResidualCollector) {}

	analyze(source: string, file: string, options: AnalyzeOptions): FileFoldStats {
		return analyzeSource(source, file, options, { residuals: this.residuals });
	}

	summarize(files: Array<FileFoldStats>): FoldSummary {
		return summarize(files);
	}

	format(summary: FoldSummary): string {
		return formatReport(summary);
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
	forEachFile(
		paths: readonly string[],
		visit: (file: Pick<SourceWorkspaceFile, "path" | "source" | "scan">) => void,
	): void;
	readFiles(paths: readonly string[]): readonly { file: string; content: string }[];
}

class DefaultAnalysisWorkspace implements AnalysisWorkspacePort {
	private readonly sourceWorkspace = createSourceWorkspace();

	loadConfig(twPath: string): ReturnType<typeof loadTwConfig> {
		return loadTwConfig(twPath);
	}

	collectFiles(patterns: readonly string[], root: string): readonly string[] {
		const files = this.sourceWorkspace
			.files(patterns, root)
			.filter((file) => SOURCE_SCANNER_SERVICE.isScriptFile(file));
		return this.sourceWorkspace
			.read(files)
			.filter(({ scan }) => scan.program !== undefined)
			.map(({ path }) => path);
	}

	forEachFile(
		paths: readonly string[],
		visit: (file: Pick<SourceWorkspaceFile, "path" | "source" | "scan">) => void,
	): void {
		this.sourceWorkspace.forEach(paths, ({ path, source, scan }) => visit({ path, source, scan }));
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
	const defaults = new DefaultFoldAnalysis(dependencies.residuals);
	return {
		analyze:
			dependencies.implementation?.analyze?.bind(dependencies.implementation) ??
			defaults.analyze.bind(defaults),
		summarize:
			dependencies.implementation?.summarize?.bind(dependencies.implementation) ??
			defaults.summarize.bind(defaults),
		format:
			dependencies.implementation?.format?.bind(dependencies.implementation) ??
			defaults.format.bind(defaults),
	};
};
export const createAnalysisWorkspace = (): AnalysisWorkspacePort => new DefaultAnalysisWorkspace();
export const createCssBudgetService = (dependencies: CssBudgetDependencies = {}): CssBudgetPort =>
	new CssBudgetService(dependencies.evaluator, dependencies.renderer, dependencies.inspection);
