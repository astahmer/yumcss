import type { DifferentialResult } from "./differential.ts";
import { DifferentialCorpusRunner } from "./differential-runner.ts";
import type {
	DifferentialCorpusCase,
	DifferentialCorpusCatalog,
	DifferentialCorpusResult,
} from "./differential-runner.ts";

/** Versioned acceptance matrix for adapter-pair proof, not just unit fixtures. */
export const DIFFERENTIAL_MATRIX_SCHEMA = "pandwind.differential-matrix/1" as const;

export type DifferentialMatrixCase = DifferentialCorpusCase;

export type DifferentialMatrixCatalog = DifferentialCorpusCatalog;

export interface DifferentialMatrixResult extends Omit<DifferentialCorpusResult, "schema"> {
	readonly schema: typeof DIFFERENTIAL_MATRIX_SCHEMA;
}

export function runDifferentialMatrix(
	catalog: DifferentialMatrixCatalog,
): DifferentialMatrixResult {
	const results = new DifferentialCorpusRunner().run(catalog);
	return {
		...results,
		schema: DIFFERENTIAL_MATRIX_SCHEMA,
	};
}
