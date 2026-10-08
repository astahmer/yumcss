import type { AdapterValidationResult } from "./adapter-contract.ts";
import type { StyleProgramResidual } from "./semantic-ir.ts";

export type ExpectedAdapterResidual = Pick<StyleProgramResidual, "kind" | "text" | "hint">;

const matchesExpectedResiduals = (
	actual: readonly StyleProgramResidual[],
	expected: readonly ExpectedAdapterResidual[],
): boolean =>
	actual.length === expected.length &&
	actual.every((residual, index) => {
		const expectedResidual = expected[index];
		return (
			expectedResidual !== undefined &&
			expectedResidual.kind === residual.kind &&
			expectedResidual.text === residual.text &&
			expectedResidual.hint === residual.hint
		);
	});

export const matchesAdapterValidationExpectation = ({
	expectedResiduals,
	emittedResiduals,
	validation,
}: {
	expectedResiduals: readonly ExpectedAdapterResidual[] | undefined;
	emittedResiduals: readonly StyleProgramResidual[];
	validation: AdapterValidationResult;
}): boolean => {
	if (expectedResiduals === undefined) return validation.valid;
	if (
		!matchesExpectedResiduals(emittedResiduals, expectedResiduals) ||
		!matchesExpectedResiduals(validation.residuals, expectedResiduals)
	)
		return false;
	if (expectedResiduals.length === 0) return validation.valid;
	return (
		!validation.valid &&
		validation.lossiness === "lossy" &&
		validation.canonicalSource === validation.canonicalTarget
	);
};
