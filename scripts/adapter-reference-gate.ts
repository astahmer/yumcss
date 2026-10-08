export interface AdapterReferenceGateInput {
	readonly migration: {
		readonly converted: number;
		readonly residuals: number;
		readonly sourcePreserved: boolean;
		readonly residualSourcePreserved: boolean;
		readonly differences: readonly string[];
	};
	readonly canonicalCss: {
		readonly checked: boolean;
		readonly equal: boolean;
		readonly notLarger: boolean;
	};
	readonly browser: {
		readonly checked: boolean;
		readonly equivalent: boolean;
		readonly hydrationEquivalent: boolean;
		readonly errors: readonly string[];
	};
}

export const adapterReferenceProofFails = (reference: AdapterReferenceGateInput): boolean =>
	reference.migration.differences.length > 0 ||
	!reference.migration.residualSourcePreserved ||
	(reference.migration.converted > 0 &&
		(!reference.canonicalCss.checked || !reference.browser.checked)) ||
	(reference.canonicalCss.checked &&
		(!reference.canonicalCss.equal || !reference.canonicalCss.notLarger)) ||
	(reference.browser.checked &&
		(!reference.browser.equivalent ||
			!reference.browser.hydrationEquivalent ||
			reference.browser.errors.length > 0)) ||
	(!reference.browser.checked &&
		(reference.migration.converted > 0 ||
			!reference.migration.sourcePreserved ||
			reference.migration.residuals === 0));
