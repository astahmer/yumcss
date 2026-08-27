import { describe, expect, test } from "vitest";
import {
	DIFFERENTIAL_MATRIX,
	DIFFERENTIAL_MATRIX_SCHEMA,
	runDifferentialMatrix,
} from "../src/swap/index.ts";

describe("production differential matrix", () => {
	test("covers adapter families with browser, SSR, hydration, streaming, and dependency evidence", () => {
		const result = runDifferentialMatrix();
		expect(result.schema).toBe(DIFFERENTIAL_MATRIX_SCHEMA);
		expect(result.cases).toHaveLength(DIFFERENTIAL_MATRIX.length);
		expect(result.failed).toBe(0);
		expect(result.passed).toBe(
			DIFFERENTIAL_MATRIX.filter((fixture) => fixture.expected === "pass").length +
				DIFFERENTIAL_MATRIX.filter((fixture) => fixture.expected === "residual").length,
		);
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
