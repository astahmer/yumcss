import { DifferentialProofKind } from "./identifiers.ts";
import type { DifferentialCorpusCatalog } from "./differential-runner.ts";

export interface DifferentialContractFailure {
	readonly caseId: string;
	readonly check: "identity" | "proof" | "hook";
	readonly message: string;
}

export interface DifferentialContractReport {
	readonly cases: number;
	readonly failures: readonly DifferentialContractFailure[];
	readonly valid: boolean;
}

const requiredProofs = [
	DifferentialProofKind.CanonicalCss,
	DifferentialProofKind.BrowserStates,
	DifferentialProofKind.SsrHydration,
	DifferentialProofKind.RscStreaming,
	DifferentialProofKind.Dependencies,
	DifferentialProofKind.Residuals,
] as const;

/** Validate a differential corpus before any adapter pair is executed. */
// oxlint-disable-next-line typescript/no-extraneous-class -- scoped corpus policy
export class DifferentialCorpusContractSuite {
	static inspect(catalog: DifferentialCorpusCatalog): DifferentialContractReport {
		const failures: DifferentialContractFailure[] = [];
		const ids = new Set<string>();
		for (const fixture of catalog.cases) {
			if (ids.has(fixture.id))
				failures.push({ caseId: fixture.id, check: "identity", message: "duplicate case id" });
			ids.add(fixture.id);
			if (fixture.sourceAdapter === fixture.targetAdapter)
				failures.push({
					caseId: fixture.id,
					check: "identity",
					message: "source and target adapters must be distinct",
				});
			for (const proof of requiredProofs) {
				if (!fixture.proofs.includes(proof))
					failures.push({
						caseId: fixture.id,
						check: "proof",
						message: `missing ${proof} proof declaration`,
					});
			}
			if (fixture.browserStates?.length === 0)
				failures.push({
					caseId: fixture.id,
					check: "hook",
					message: "browser proof has no states",
				});
			if (fixture.ssr === undefined)
				failures.push({
					caseId: fixture.id,
					check: "hook",
					message: "SSR/hydration hook is missing",
				});
			if (fixture.streaming === undefined)
				failures.push({ caseId: fixture.id, check: "hook", message: "streaming hook is missing" });
		}
		return { cases: catalog.cases.length, failures, valid: failures.length === 0 };
	}

	static assert(report: DifferentialContractReport): void {
		if (!report.valid)
			throw new Error(
				`differential corpus contract failed: ${report.failures
					.map((failure) => `${failure.caseId} ${failure.check}: ${failure.message}`)
					.join("; ")}`,
			);
	}
}
