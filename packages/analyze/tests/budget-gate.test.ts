/**
 * CI budget-gate unit tests (plans/023): --fail-over ceiling + --budgets
 * per-lane caps. The gate is pure evaluation (evaluateBudget) so exit-code
 * behavior is pinned without spawning the CLI.
 */
import { describe, expect, test } from "vitest";
import { evaluateBudget, parseBudgets } from "../src/cli.ts";

const measured = { cssBytes: 10_000, cssGzipBytes: 3_000, rules: 150 };

describe("parseBudgets", () => {
	test("keeps known numeric lanes, ignores unknown keys", () => {
		expect(parseBudgets(JSON.stringify({ css: 1, gzip: 2, rules: 3, bogus: "x" }))).toEqual({
			css: 1,
			gzip: 2,
			rules: 3,
		});
	});

	test("rejects negative and non-numeric caps silently", () => {
		expect(parseBudgets(JSON.stringify({ css: -5, gzip: "12", rules: 0 }))).toEqual({ rules: 0 });
	});
});

describe("evaluateBudget", () => {
	test("no caps = no violations", () => {
		expect(evaluateBudget(measured, undefined, {})).toEqual([]);
	});

	test("--fail-over ceiling trips above, passes at-or-below", () => {
		const over = evaluateBudget(measured, 9_999, {});
		expect(over).toHaveLength(1);
		expect(over[0]).toContain("exceed --fail-over ceiling 9999");
		expect(evaluateBudget(measured, 10_000, {})).toEqual([]);
	});

	test("per-lane budgets caps trip independently", () => {
		const violations = evaluateBudget(measured, undefined, { gzip: 2_999, rules: 150 });
		expect(violations).toHaveLength(1);
		expect(violations[0]).toContain("gzip bytes 3000 exceed budgets cap 2999");
	});

	test("combined fail-over + budgets report every violation", () => {
		const violations = evaluateBudget(measured, 1_000, { css: 500 });
		expect(violations).toHaveLength(2);
	});
});
