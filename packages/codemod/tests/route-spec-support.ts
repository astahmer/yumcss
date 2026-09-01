import { expect } from "vitest";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	runAdapterMigration,
	type AdapterMigrationOptions,
	type AdapterMigrationResult,
} from "../src/swap/index.ts";

const catalog = createBuiltinCodemodCatalog();

export interface AdapterRouteInput {
	readonly source: string;
	readonly file: string;
	readonly semantic?: AdapterMigrationOptions["semantic"];
}

export interface AdapterRouteSpec {
	readonly source: CodemodAdapterId;
	readonly target: CodemodAdapterId;
	run(input: AdapterRouteInput): AdapterMigrationResult;
}

/** In-process route harness shared by every generated directional spec. */
export function createAdapterRouteSpec(
	source: CodemodAdapterId,
	target: CodemodAdapterId,
): AdapterRouteSpec {
	return {
		source,
		target,
		run(input) {
			return runAdapterMigration(input.source, {
				from: source,
				to: target,
				file: input.file,
				mode: "safe",
				readFile: () => undefined,
				adapterRegistry: catalog.registry,
				...(input.semantic === undefined ? {} : { semantic: input.semantic }),
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
	if (result.skipped > 0) expect(result.code).toContain("pandwind:migrate-skip");
	if (result.skipped > 0) expect(result.residuals.length).toBeGreaterThan(0);
	for (const residual of result.residuals) {
		expect(residual.text.length).toBeGreaterThan(0);
		expect(residual.hint.length).toBeGreaterThan(0);
	}
}

/**
 * A round trip must either be parseable by the reverse adapter or visibly
 * identify the source-preserving/runtime fallback that made the reverse leg
 * inapplicable. A silent unchanged second leg is never acceptable.
 */
export function expectActionableRoundTrip(
	forward: AdapterMigrationResult,
	reverse: AdapterMigrationResult,
): void {
	const reverseActionable =
		reverse.converted > 0 ||
		reverse.skipped > 0 ||
		reverse.residuals.length > 0 ||
		reverse.code !== forward.code;
	const visibleFallback =
		forward.code.includes("pandwind:migrate-skip") ||
		forward.code.includes('"pandwind/') ||
		forward.code.includes('"pandwind\\n');
	expect(reverseActionable || visibleFallback).toBe(true);
	if (reverseActionable) expect(reverse.code).not.toBe(forward.code);
}
