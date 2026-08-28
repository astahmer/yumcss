import { type Root } from "postcss";
import { PostCssArtifactAnalyzer, type SheetShape } from "./css-artifact-analyzer.ts";
import type {
	CssArtifactCompiler,
	CssBudgetInput,
	CssCandidateScanner,
} from "./css-budget-contracts.ts";

interface ClassRule {
	selector: string;
	declarations: string;
}

export interface ClassDrillDown {
	candidate: string;
	rules: Array<ClassRule>;
}

export interface CssArtifactInspectionPort {
	classRules(input: CssBudgetInput): Promise<readonly ClassDrillDown[]>;
	sheetShape(input: CssBudgetInput): Promise<SheetShape>;
	sheetShapeFromRoot(root: Root): SheetShape;
}

const baseSelector = (candidate: string): string => {
	const [base] = candidate.split(":");
	return base!.replace(/\\/g, "").replace(/[.*+?^${}()|[\]]/g, "\\$&");
};

/** Artifact inspection policy, composed from the same source/compiler ports as budgets. */
export class TailwindCssArtifactInspection implements CssArtifactInspectionPort {
	constructor(
		private readonly candidates: CssCandidateScanner,
		private readonly compiler: CssArtifactCompiler,
		private readonly shapeAnalyzer = new PostCssArtifactAnalyzer(),
	) {}

	async classRules(input: CssBudgetInput): Promise<readonly ClassDrillDown[]> {
		const candidates = await this.candidates.scan(input);
		const root = await this.compiler.compile(input, candidates);
		const compiledRules: Array<{ selector: string; text: string; plain: string }> = [];
		root.walkRules((rule) => {
			compiledRules.push({
				selector: rule.selector,
				text: rule.toString(),
				plain: rule.selector.replace(/\\/g, ""),
			});
		});
		return candidates
			.flatMap((candidate) => {
				const pattern = baseSelector(candidate.split(":").pop() ?? candidate);
				if (pattern === "") return [];
				const rules = compiledRules
					.filter((rule) => rule.plain.includes(pattern))
					.map((rule) => ({ selector: rule.selector, declarations: rule.text }));
				return rules.length > 0 ? [{ candidate, rules }] : [];
			})
			.toSorted((a, b) => b.rules.length - a.rules.length);
	}

	async sheetShape(input: CssBudgetInput): Promise<SheetShape> {
		const candidates = await this.candidates.scan(input);
		return this.sheetShapeFromRoot(await this.compiler.compile(input, candidates));
	}

	sheetShapeFromRoot(root: Root): SheetShape {
		return this.shapeAnalyzer.shape(root);
	}
}
