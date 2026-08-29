import {
	runDifferentialFixture,
	type DifferentialFixture,
	type DifferentialRender,
	type DifferentialResult,
} from "./differential.ts";
import { styleProgramToCanonicalCss, type StyleProgram } from "./semantic-ir.ts";

export const DIFFERENTIAL_CORPUS_RUNNER_SCHEMA = "pandwind.differential-corpus-runner/1" as const;

export interface DifferentialCorpusCase extends Omit<DifferentialFixture, "name"> {
	readonly id: string;
	readonly expected: "pass" | "residual";
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

const css = (program: StyleProgram): string => styleProgramToCanonicalCss(program);
const render = (program: StyleProgram): DifferentialRender => ({
	html: `<div data-style="${css(program)}"></div>`,
	css: css(program),
});

function withProofHooks(fixture: DifferentialCorpusCase): DifferentialFixture {
	return {
		...fixture,
		name: fixture.id,
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
	};
}

/** Application service for running a complete source/target proof corpus. */
export class DifferentialCorpusRunner implements DifferentialCorpusRunnerPort {
	constructor(
		private readonly runFixture: (fixture: DifferentialFixture) => DifferentialResult =
			runDifferentialFixture,
	) {}

	run(catalog: DifferentialCorpusCatalog): DifferentialCorpusResult {
		const cases = catalog.cases.map((fixture) =>
			this.runFixture(withProofHooks(fixture)),
		);
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
