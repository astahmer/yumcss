import type {
	CssArtifactCompiler,
	CssBudget,
	CssBudgetInput,
	CssBudgetMetrics,
	CssCandidateScanner,
} from "./css-budget-contracts.ts";
import { TailwindArtifactCompiler } from "./css-budget-compiler.ts";
import { TailwindCandidateScanner } from "./css-budget-candidates.ts";
import { DefaultCssBudgetMetrics } from "./css-budget-metrics.ts";

export interface CssBudgetEvaluatorDependencies {
	readonly candidates?: CssCandidateScanner;
	readonly compiler?: CssArtifactCompiler;
	readonly metrics?: CssBudgetMetrics;
}

/** Budget use case. Source discovery, compilation, and accounting are ports. */
export class CssBudgetEvaluator {
	private readonly candidates: CssCandidateScanner;
	private readonly compiler: CssArtifactCompiler;
	private readonly metrics: CssBudgetMetrics;

	constructor(dependencies: CssBudgetEvaluatorDependencies = {}) {
		this.candidates = dependencies.candidates ?? new TailwindCandidateScanner();
		this.compiler = dependencies.compiler ?? new TailwindArtifactCompiler();
		this.metrics = dependencies.metrics ?? new DefaultCssBudgetMetrics();
	}

	async measure(input: CssBudgetInput): Promise<CssBudget> {
		const candidates = await this.candidates.scan(input);
		const root = await this.compiler.compile(input, candidates);
		return this.metrics.measure(root, candidates, input.themeCss);
	}
}
