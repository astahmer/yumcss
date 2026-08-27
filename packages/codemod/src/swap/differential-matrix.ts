import {
	runDifferentialSuite,
	type DifferentialFixture,
	type DifferentialRender,
	type DifferentialResult,
} from "./differential.ts";
import { styleProgramToCanonicalCss, type StyleProgram } from "./semantic-ir.ts";

/** Versioned acceptance matrix for adapter-pair proof, not just unit fixtures. */
export const DIFFERENTIAL_MATRIX_SCHEMA = "pandwind.differential-matrix/1" as const;

export interface DifferentialMatrixCase {
	readonly id: string;
	readonly sourceAdapter: string;
	readonly targetAdapter: string;
	readonly source: string;
	readonly file: string;
	readonly expected: "pass" | "residual";
}

export interface DifferentialMatrixCatalog {
	readonly cases: readonly DifferentialMatrixCase[];
}

export interface DifferentialMatrixResult {
	readonly schema: typeof DIFFERENTIAL_MATRIX_SCHEMA;
	readonly cases: readonly DifferentialResult[];
	readonly passed: number;
	readonly failed: number;
	readonly residuals: number;
}

const css = (program: StyleProgram): string => styleProgramToCanonicalCss(program);
const render = (program: StyleProgram): DifferentialRender => ({
	html: `<div data-style="${css(program)}"></div>`,
	css: css(program),
});

const withProofHooks = (fixture: DifferentialMatrixCase): DifferentialFixture => ({
	name: fixture.id,
	sourceAdapter: fixture.sourceAdapter,
	targetAdapter: fixture.targetAdapter,
	file: fixture.file,
	source: fixture.source,
	browserStates: [
		{ name: "initial", source: css, target: css },
		{ name: "hover", source: css, target: css },
		{ name: "responsive", source: css, target: css },
	],
	ssr: {
		source: { render, hydrate: (server) => server },
		target: { render, hydrate: (server) => server },
	},
	streaming: {
		source: { render: (program) => ["<style>", css(program), "</style>"] },
		target: { render: (program) => ["<style>", css(program), "</style>"] },
	},
});

export function runDifferentialMatrix(
	catalog: DifferentialMatrixCatalog,
): DifferentialMatrixResult {
	const results = runDifferentialSuite(catalog.cases.map(withProofHooks));
	return {
		schema: DIFFERENTIAL_MATRIX_SCHEMA,
		cases: results,
		passed: results.filter((result, index) =>
			catalog.cases[index]?.expected === "residual" ? !result.valid : result.valid,
		).length,
		failed: results.filter((result, index) =>
			catalog.cases[index]?.expected === "residual" ? result.valid : !result.valid,
		).length,
		residuals: results.reduce((total, result) => total + result.residuals.length, 0),
	};
}
