import {
	styleProgramToCanonicalCss,
	type StyleProgram,
	type StyleProgramResidual,
} from "./semantic-ir.ts";
import type { AdapterLossiness, AdapterValidationResult } from "./adapter-contract.ts";

export const VALIDATOR_SCHEMA = "pandwind.style-validator/1" as const;

export interface StyleValidationContext {
	readonly source: StyleProgram;
	readonly target: StyleProgram;
	readonly residuals: readonly StyleProgramResidual[];
	readonly fixture?: string;
}

export interface StyleValidationEvidence {
	readonly validator: string;
	readonly valid: boolean;
	readonly lossiness: AdapterLossiness;
	readonly differences: readonly string[];
	readonly residuals?: readonly StyleProgramResidual[];
}

export interface StyleValidator {
	readonly schema: typeof VALIDATOR_SCHEMA;
	readonly id: string;
	validate(context: StyleValidationContext): StyleValidationEvidence;
}

export interface StyleValidatorRegistry {
	readonly validators: readonly StyleValidator[];
	register(validator: StyleValidator): StyleValidatorRegistry;
	validate(context: StyleValidationContext): AdapterValidationResult;
}

const canonicalValidator: StyleValidator = {
	schema: VALIDATOR_SCHEMA,
	id: "canonical-css",
	validate: ({ source, target }) => {
		const canonicalSource = styleProgramToCanonicalCss(source);
		const canonicalTarget = styleProgramToCanonicalCss(target);
		return {
			validator: "canonical-css",
			valid: canonicalSource === canonicalTarget,
			lossiness: canonicalSource === canonicalTarget ? "lossless" : "unsupported",
			differences: canonicalSource === canonicalTarget ? [] : ["canonical CSS differs"],
		};
	},
};

const residualValidator: StyleValidator = {
	schema: VALIDATOR_SCHEMA,
	id: "residuals",
	validate: ({ residuals }) => ({
		validator: "residuals",
		valid: residuals.length === 0,
		lossiness: residuals.length === 0 ? "lossless" : "lossy",
		differences: residuals.length === 0 ? [] : [`${residuals.length} residual conversion(s)`],
		residuals,
	}),
};

export function createStyleValidatorRegistry(
	initial: readonly StyleValidator[] = [canonicalValidator, residualValidator],
): StyleValidatorRegistry {
	const validators = new Map<string, StyleValidator>();
	const registry: StyleValidatorRegistry = {
		get validators() {
			return [...validators.values()];
		},
		register(validator) {
			if (validator.schema !== VALIDATOR_SCHEMA)
				throw new Error(`unsupported validator schema: ${validator.schema}`);
			if (validators.has(validator.id)) throw new Error(`validator already registered: ${validator.id}`);
			validators.set(validator.id, validator);
			return registry;
		},
		validate(context) {
			const evidence = registry.validators.map((validator) => validator.validate(context));
			const differences = evidence.flatMap((item) => item.differences);
			const residuals = evidence.flatMap((item) => item.residuals ?? []);
			const canonicalSource = styleProgramToCanonicalCss(context.source);
			const canonicalTarget = styleProgramToCanonicalCss(context.target);
			const valid = evidence.every((item) => item.valid);
			const lossiness: AdapterLossiness = evidence.some((item) => item.lossiness === "unsupported")
				? "unsupported"
				: evidence.some((item) => item.lossiness === "lossy")
					? "lossy"
					: "lossless";
			return { valid, lossiness, canonicalSource, canonicalTarget, differences, residuals };
		},
	};
	for (const validator of initial) registry.register(validator);
	return registry;
}

export const STYLE_VALIDATORS = createStyleValidatorRegistry();
