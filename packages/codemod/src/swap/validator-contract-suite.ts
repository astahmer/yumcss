import type {
	StyleValidator,
	StyleValidatorRegistry,
	StyleValidationContext,
} from "./validator-registry.ts";

export const VALIDATOR_CONTRACT_SUITE_SCHEMA = "pandwind.validator-contract-suite/1" as const;

export type ValidatorContractPhase = "registration" | "execution" | "result";

export interface ValidatorContractFixture {
	readonly validator: string;
	readonly context: StyleValidationContext;
	readonly expectedValid?: boolean;
}

export interface ValidatorContractFailure {
	readonly validator: string;
	readonly phase: ValidatorContractPhase;
	readonly message: string;
}

export interface ValidatorContractResult {
	readonly schema: typeof VALIDATOR_CONTRACT_SUITE_SCHEMA;
	readonly valid: boolean;
	readonly checked: readonly string[];
	readonly failures: readonly ValidatorContractFailure[];
}

export interface ValidatorContractSuite {
	run(
		registry: StyleValidatorRegistry,
		fixtures: readonly ValidatorContractFixture[],
	): ValidatorContractResult;
}

function failure(
	validator: string,
	phase: ValidatorContractPhase,
	message: string,
): ValidatorContractFailure {
	return { validator, phase, message };
}

function validateResult(validator: StyleValidator, result: unknown): string | undefined {
	if (result === null || typeof result !== "object")
		return "validator returned a non-object result";
	const evidence = result as { validator?: unknown; valid?: unknown; differences?: unknown };
	if (evidence.validator !== validator.id)
		return `validator result identity ${String(evidence.validator)} does not match ${validator.id}`;
	if (typeof evidence.valid !== "boolean")
		return "validator result did not declare valid as a boolean";
	if (!Array.isArray(evidence.differences))
		return "validator result did not declare differences as an array";
	return undefined;
}

/**
 * Execute validators through their public registry contract. The suite is
 * intentionally independent of any concrete validator implementation: a
 * third-party validator only needs one fixture and a well-formed evidence
 * result to participate in the same gate.
 */
export function createValidatorContractSuite(): ValidatorContractSuite {
	return {
		run(registry, fixtures) {
			const fixtureById = new Map(fixtures.map((fixture) => [fixture.validator, fixture]));
			const failures: ValidatorContractFailure[] = [];
			const checked: string[] = [];
			for (const validator of registry.validators) {
				checked.push(validator.id);
				const fixture = fixtureById.get(validator.id);
				if (fixture === undefined) {
					failures.push(
						failure(validator.id, "registration", "validator has no conformance fixture"),
					);
					continue;
				}
				try {
					const result = validator.validate(fixture.context);
					const malformed = validateResult(validator, result);
					if (malformed !== undefined) {
						failures.push(failure(validator.id, "result", malformed));
						continue;
					}
					if (fixture.expectedValid !== undefined && result.valid !== fixture.expectedValid)
						failures.push(
							failure(
								validator.id,
								"result",
								`expected valid=${fixture.expectedValid}, received valid=${result.valid}`,
							),
						);
				} catch (error) {
					failures.push(
						failure(
							validator.id,
							"execution",
							error instanceof Error ? error.message : "validator threw a non-error value",
						),
					);
				}
			}
			for (const fixture of fixtures) {
				if (registry.validators.every((validator) => validator.id !== fixture.validator))
					failures.push(
						failure(fixture.validator, "registration", "fixture targets an unregistered validator"),
					);
			}
			return {
				schema: VALIDATOR_CONTRACT_SUITE_SCHEMA,
				valid: failures.length === 0,
				checked,
				failures,
			};
		},
	};
}
