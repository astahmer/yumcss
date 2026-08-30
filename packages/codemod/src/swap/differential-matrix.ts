import {
	runDifferentialSuite,
	type DifferentialFixture,
	type DifferentialRender,
	type DifferentialResult,
} from "./differential.ts";
import type { StyleProgram } from "./semantic-ir.ts";
import { createRuntimeSheet, type RuntimeSemanticRule } from "pandwind/css/runtime";

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

/** Independent serializer oracle used by matrix hooks, separate from the IR serializer. */
const runtimeCss = (program: StyleProgram): string => {
	const value = (
		input: StyleProgram["declarations"][number]["value"],
	): string | number | boolean => {
		if (input.kind === "token") return input.authored;
		if (input.kind === "dynamic") return input.expression;
		return input.value;
	};
	const condition = (input: StyleProgram["rules"][number]["conditions"][number]): string =>
		input.kind === "media" || input.kind === "container" || input.kind === "supports"
			? `@${input.kind} ${input.value ?? input.name}`
			: (input.value ?? input.raw ?? input.name);
	const rule = (input: StyleProgram["rules"][number]): RuntimeSemanticRule => ({
		kind: input.kind,
		name: input.name,
		selector: input.selector,
		layer: input.layer,
		conditions: input.conditions.map(condition),
		declarations: input.declarations.map((declaration) => ({
			property: declaration.property,
			value: value(declaration.value),
		})),
		children: input.children.map(rule),
	});
	const sheet = createRuntimeSheet({ autoMount: false });
	sheet.registerSemanticRules(program.rules.map(rule));
	return sheet.css();
};

const render = (program: StyleProgram): DifferentialRender => ({
	html: `<div data-style="${runtimeCss(program)}"></div>`,
	css: runtimeCss(program),
});

const withProofHooks = (fixture: DifferentialMatrixCase): DifferentialFixture => ({
	name: fixture.id,
	sourceAdapter: fixture.sourceAdapter,
	targetAdapter: fixture.targetAdapter,
	file: fixture.file,
	source: fixture.source,
	browserStates: [
		{ name: "initial", source: runtimeCss, target: runtimeCss },
		{ name: "hover", source: runtimeCss, target: runtimeCss },
		{ name: "responsive", source: runtimeCss, target: runtimeCss },
	],
	ssr: {
		source: { render, hydrate: (server) => server },
		target: { render, hydrate: (server) => server },
	},
	streaming: {
		source: { render: (program) => ["<style>", runtimeCss(program), "</style>"] },
		target: { render: (program) => ["<style>", runtimeCss(program), "</style>"] },
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
