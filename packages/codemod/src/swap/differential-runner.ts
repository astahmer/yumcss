import {
	runDifferentialFixture,
	type DifferentialFixture,
	type DifferentialResult,
} from "./differential.ts";
import { DifferentialProofKind } from "./identifiers.ts";

export const DIFFERENTIAL_CORPUS_RUNNER_SCHEMA = "pandwind.differential-corpus-runner/1" as const;

export interface DifferentialCorpusCase extends Omit<DifferentialFixture, "name"> {
	readonly id: string;
	readonly expected: "pass" | "residual";
	/** Dimensions are required evidence, not automatically fabricated probes. */
	readonly proofs: readonly DifferentialProofKind[];
}

export interface DifferentialCorpusCatalog {
	readonly cases: readonly DifferentialCorpusCase[];
}

export interface DifferentialCorpusResult {
	readonly schema: typeof DIFFERENTIAL_CORPUS_RUNNER_SCHEMA;
	readonly cases: readonly DifferentialResult[];
	readonly passed: number;
	readonly failed: number;
	readonly residuals: number;
}

export interface DifferentialCorpusRunnerPort {
	run(catalog: DifferentialCorpusCatalog): DifferentialCorpusResult;
}

/** Application service for running a complete source/target proof corpus. */
export class DifferentialCorpusRunner implements DifferentialCorpusRunnerPort {
	constructor(
		private readonly runFixture: (
			fixture: DifferentialFixture,
		) => DifferentialResult = runDifferentialFixture,
	) {}

	run(catalog: DifferentialCorpusCatalog): DifferentialCorpusResult {
		const cases = catalog.cases.map((fixture) => {
			const result = this.runFixture({ ...fixture, name: fixture.id });
			const missing = fixture.proofs.filter((proof) => {
				switch (proof) {
					case DifferentialProofKind.CanonicalCss:
						return result.canonicalSource === "" || result.canonicalTarget === "";
					case DifferentialProofKind.BrowserStates:
						return result.browser.length === 0;
					case DifferentialProofKind.SsrHydration:
						return result.ssr === undefined;
					case DifferentialProofKind.RscStreaming:
						return result.streaming === undefined;
					case DifferentialProofKind.Dependencies:
						return result.dependencies.length < 2;
					case DifferentialProofKind.Residuals:
						return result.residuals === undefined;
				}
			});
			return missing.length === 0
				? result
				: {
						...result,
						valid: false,
						differences: [
							...result.differences,
							`missing explicit proof dimensions: ${missing.join(", ")}`,
						],
					};
		});
		const passed = cases.filter((result, index) => {
			const expected = catalog.cases[index]?.expected;
			return expected === "residual" ? !result.valid : result.valid;
		}).length;
		return {
			schema: DIFFERENTIAL_CORPUS_RUNNER_SCHEMA,
			cases,
			passed,
			failed: cases.length - passed,
			residuals: cases.reduce((total, result) => total + result.residuals.length, 0),
		};
	}
}
