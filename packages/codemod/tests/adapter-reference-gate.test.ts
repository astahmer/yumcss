import { expect, test } from "vitest";
import {
	adapterReferenceProofFails,
	type AdapterReferenceGateInput,
} from "../../../scripts/adapter-reference-gate.ts";

const verified: AdapterReferenceGateInput = {
	migration: { converted: 1, residuals: 0, sourcePreserved: false, differences: [] },
	canonicalCss: { checked: true, equal: true, notLarger: true },
	browser: { checked: true, equivalent: true, hydrationEquivalent: true, errors: [] },
};

const preserved: AdapterReferenceGateInput = {
	migration: { converted: 0, residuals: 1, sourcePreserved: true, differences: [] },
	canonicalCss: { checked: false, equal: false, notLarger: true },
	browser: { checked: false, equivalent: false, hydrationEquivalent: false, errors: [] },
};

test("accepts verified CSS and explicitly preserved unsupported input", () => {
	expect(adapterReferenceProofFails(verified)).toBe(false);
	expect(adapterReferenceProofFails(preserved)).toBe(false);
});

test("fails missing proof, source loss, and unreported unsupported input", () => {
	expect(adapterReferenceProofFails({ ...preserved, migration: verified.migration })).toBe(true);
	expect(
		adapterReferenceProofFails({
			...preserved,
			migration: { ...preserved.migration, sourcePreserved: false },
		}),
	).toBe(true);
	expect(
		adapterReferenceProofFails({
			...preserved,
			migration: { ...preserved.migration, residuals: 0 },
		}),
	).toBe(true);
});

test("fails canonical differences, CSS growth, browser differences, and hydration errors", () => {
	expect(
		adapterReferenceProofFails({
			...verified,
			migration: { ...verified.migration, differences: ["color differs"] },
		}),
	).toBe(true);
	for (const canonicalCss of [
		{ ...verified.canonicalCss, equal: false },
		{ ...verified.canonicalCss, notLarger: false },
	])
		expect(adapterReferenceProofFails({ ...verified, canonicalCss })).toBe(true);
	for (const browser of [
		{ ...verified.browser, equivalent: false },
		{ ...verified.browser, hydrationEquivalent: false },
		{ ...verified.browser, errors: ["page error"] },
	])
		expect(adapterReferenceProofFails({ ...verified, browser })).toBe(true);
});
