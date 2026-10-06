import { collectTwClasses } from "@yumcss/codemod/tw";
import type { CssBudgetInput, CssCandidateScanner } from "./css-budget-contracts.ts";

/** Source-facing candidate port. It deliberately knows nothing about CSS output. */
export class TailwindCandidateScanner implements CssCandidateScanner {
	scan(input: CssBudgetInput): Promise<readonly string[]> {
		return collectTwClasses([...input.files], input.twEntry);
	}
}
