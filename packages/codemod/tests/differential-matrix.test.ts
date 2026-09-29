import { describe, expect, test } from "vitest";
import {
	DIFFERENTIAL_MATRIX_SCHEMA,
	DifferentialExpectedTag,
	DifferentialProofMode,
	runDifferentialMatrix,
} from "../src/swap/index.ts";
import { differentialMatrixFixtures } from "./differential-matrix.fixtures.ts";

describe("production differential matrix", () => {
	test("covers adapter families with browser, SSR, hydration, streaming, and dependency evidence", () => {
		const result = runDifferentialMatrix(differentialMatrixFixtures);
		expect(result.schema).toBe(DIFFERENTIAL_MATRIX_SCHEMA);
		expect(result.proofMode).toBe(DifferentialProofMode.SemanticModel);
		expect(result.cases).toHaveLength(differentialMatrixFixtures.cases.length);
		expect(
			result.failed,
			JSON.stringify(
				result.cases.flatMap((item, index) => {
					const expected = differentialMatrixFixtures.cases[index]?.expected;
					const failed = expected === DifferentialExpectedTag.Residual ? item.valid : !item.valid;
					return failed
						? [
								{
									fixture: item.fixture,
									canonicalSource: item.canonicalSource,
									canonicalTarget: item.canonicalTarget,
									differences: item.differences,
									residuals: item.residuals,
								},
							]
						: [];
				}),
				null,
				2,
			),
		).toBe(0);
		expect(result.passed).toBe(differentialMatrixFixtures.cases.length);
		expect(
			result.cases.filter((item) => item.valid).every((item) => item.browser.length === 3),
		).toBe(true);
		expect(result.cases.filter((item) => item.valid).every((item) => item.ssr?.valid)).toBe(true);
		expect(result.cases.filter((item) => item.valid).every((item) => item.streaming?.valid)).toBe(
			true,
		);
		expect(
			result.cases.filter((item) => !item.valid).every((item) => item.residuals.length > 0),
		).toBe(true);
		expect(result.cases.some((item) => item.dependencyChanges.length > 0)).toBe(true);
	});
});
