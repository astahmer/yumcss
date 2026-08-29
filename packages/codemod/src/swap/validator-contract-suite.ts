import {
	VALIDATOR_SCHEMA,
	type StyleValidationContext,
	type StyleValidator,
	type StyleValidatorRegistry,
} from "./validator-registry.ts";

export interface ValidatorContractProbe {
	readonly context: StyleValidationContext;
}

export interface ValidatorContractFailure {
	readonly validator: string;
	readonly check: "schema" | "identity" | "result";
	readonly message: string;
}

export interface ValidatorContractReport {
	readonly validator: string;
	readonly failures: readonly ValidatorContractFailure[];
	readonly valid: boolean;
}

/**
 * Generic validator conformance boundary. Validators are deliberately probed
 * through their public contract so an external validator can be substituted
 * without changing differential orchestration.
 */
// oxlint-disable-next-line typescript/no-extraneous-class -- scoped contract policy
export class ValidatorContractSuite {
	static inspect(
		validator: StyleValidator,
		probe: ValidatorContractProbe,
	): ValidatorContractReport {
		const failures: ValidatorContractFailure[] = [];
		const fail = (check: ValidatorContractFailure["check"], message: string): void => {
			failures.push({ validator: validator.id, check, message });
		};

		if (validator.schema !== VALIDATOR_SCHEMA)
			fail("schema", `expected ${VALIDATOR_SCHEMA}, received ${validator.schema}`);
		if (validator.id.trim() === "") fail("identity", "validator id must not be empty");
		try {
			const result = validator.validate(probe.context);
			if (typeof result.valid !== "boolean") fail("result", "valid must be boolean");
			if (!Array.isArray(result.differences)) fail("result", "differences must be an array");
			if (!Array.isArray(result.residuals ?? [])) fail("result", "residuals must be an array");
			if (
				result.lossiness !== "lossless" &&
				result.lossiness !== "lossy" &&
				result.lossiness !== "unsupported"
			)
				fail("result", `unknown lossiness: ${result.lossiness}`);
			if (result.validator !== validator.id)
				fail("result", `result identity does not match ${validator.id}`);
		} catch (error) {
			fail("result", error instanceof Error ? error.message : "validator threw");
		}
		return { validator: validator.id, failures, valid: failures.length === 0 };
	}

	static inspectRegistry(
		registry: Pick<StyleValidatorRegistry, "validators">,
		probe: ValidatorContractProbe,
	): readonly ValidatorContractReport[] {
		return registry.validators.map((validator) => this.inspect(validator, probe));
	}

	static assert(report: ValidatorContractReport): void {
		if (!report.valid)
			throw new Error(
				`${report.validator} validator contract failed: ${report.failures
					.map((failure) => `${failure.check}: ${failure.message}`)
					.join("; ")}`,
			);
	}
}
