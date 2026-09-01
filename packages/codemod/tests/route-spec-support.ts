import { expect } from "vitest";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	runAdapterMigration,
	type AdapterMigrationResult,
} from "../src/swap/index.ts";
import { completeAdapterMatrixFixtures } from "../proof/adapter-matrix-fixtures.ts";

const catalog = createBuiltinCodemodCatalog();
const fixtures = new Map(
	completeAdapterMatrixFixtures.map((fixture) => [
		`${fixture.sourceAdapter}:${fixture.scenario ?? "happy"}`,
		fixture,
	]),
);

type RouteScenario = "happy" | "edge" | "malformed";

export interface AdapterRouteSpec {
	readonly source: CodemodAdapterId;
	readonly target: CodemodAdapterId;
	run(scenario: RouteScenario): AdapterMigrationResult;
}

/** In-process route harness shared by every generated directional spec. */
export function createAdapterRouteSpec(
	source: CodemodAdapterId,
	target: CodemodAdapterId,
): AdapterRouteSpec {
	return {
		source,
		target,
		run(scenario) {
			const fixture = fixtures.get(`${source}:${scenario}`);
			if (fixture === undefined) throw new Error(`missing ${source} ${scenario} fixture`);
			return runAdapterMigration(fixture.source, {
				from: source,
				to: target,
				file: fixture.file,
				mode: "safe",
				readFile: () => undefined,
				adapterRegistry: catalog.registry,
				...(fixture.semantic === undefined ? {} : { semantic: fixture.semantic }),
			});
		},
	};
}

/** Stable, human-readable evidence for an individual directional snapshot. */
export function routeEvidence(result: AdapterMigrationResult) {
	return {
		changed: result.changed,
		converted: result.converted,
		skipped: result.skipped,
		residuals: result.residuals.map((residual) => ({
			kind: residual.kind,
			hint: residual.hint,
			preserved: residual.preserved,
		})),
		outcomes: result.outcomes.map((outcome) => ({
			outcome: outcome.outcome,
			representation: outcome.representation,
		})),
		validations: result.validations.map((validation) => ({
			valid: validation.valid,
			lossiness: validation.lossiness,
			differences: validation.differences,
		})),
		code: result.code,
	};
}

export function expectExplicitResidualEvidence(result: AdapterMigrationResult): void {
	expect(result.code).not.toContain("adapter capability mismatch");
	// A host adapter owns the opening-tag rewrite. A target emitter must never
	// leak a second JSX/Vue host into a class/style attribute expression.
	expect(result.code).not.toMatch(/\b(?:className|class|style)\s*=\s*\{\s*<[A-Za-z]/u);
	if (result.skipped > 0 || result.residuals.some((residual) => residual.preserved !== true))
		expect(result.code).toContain("pandwind:migrate-skip");
	if (result.skipped > 0) expect(result.residuals.length).toBeGreaterThan(0);
}
