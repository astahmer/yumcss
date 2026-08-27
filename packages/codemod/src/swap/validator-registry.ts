import {
	styleProgramToCanonicalCss,
	type StyleProgram,
	type StyleProgramResidual,
} from "./semantic-ir.ts";
import type {
	AdapterDependencies,
	AdapterLossiness,
	AdapterValidationResult,
} from "./adapter-contract.ts";

export const VALIDATOR_SCHEMA = "pandwind.style-validator/1" as const;

export interface StyleValidationContext {
	readonly source: StyleProgram;
	readonly target: StyleProgram;
	readonly residuals: readonly StyleProgramResidual[];
	readonly fixture?: string;
	readonly browser?: readonly { name: string; source: string; target: string }[];
	readonly ssr?: {
		readonly source: {
			server: { html: string; css: string };
			hydrated: { html: string; css: string };
		};
		readonly target: {
			server: { html: string; css: string };
			hydrated: { html: string; css: string };
		};
	};
	readonly streaming?: { readonly source: readonly string[]; readonly target: readonly string[] };
	readonly dependencies?: {
		readonly source: AdapterDependencies;
		readonly target: AdapterDependencies;
	};
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

const browserValidator: StyleValidator = {
	schema: VALIDATOR_SCHEMA,
	id: "browser-states",
	validate: ({ browser }) => {
		if (browser === undefined || browser.length === 0)
			return { validator: "browser-states", valid: true, lossiness: "lossless", differences: [] };
		const differences = browser
			.filter((state) => state.source !== state.target)
			.map((state) => `browser state differs: ${state.name}`);
		return {
			validator: "browser-states",
			valid: differences.length === 0,
			lossiness: differences.length === 0 ? "lossless" : "unsupported",
			differences,
		};
	},
};

const ssrValidator: StyleValidator = {
	schema: VALIDATOR_SCHEMA,
	id: "ssr-hydration",
	validate: ({ ssr }) => {
		if (ssr === undefined)
			return { validator: "ssr-hydration", valid: true, lossiness: "lossless", differences: [] };
		const differences: string[] = [];
		if (ssr.source.server.html !== ssr.target.server.html) differences.push("SSR HTML differs");
		if (ssr.source.server.css !== ssr.target.server.css) differences.push("SSR CSS differs");
		if (ssr.source.hydrated.html !== ssr.target.hydrated.html)
			differences.push("hydrated HTML differs");
		if (ssr.source.hydrated.css !== ssr.target.hydrated.css)
			differences.push("hydrated CSS differs");
		return {
			validator: "ssr-hydration",
			valid: differences.length === 0,
			lossiness: differences.length === 0 ? "lossless" : "unsupported",
			differences,
		};
	},
};

const dependencyValidator: StyleValidator = {
	schema: VALIDATOR_SCHEMA,
	id: "dependencies",
	validate: ({ dependencies }) => {
		if (dependencies === undefined)
			return { validator: "dependencies", valid: true, lossiness: "lossless", differences: [] };
		const targetNames = new Set(dependencies.target.packages.map((dependency) => dependency.name));
		const differences = targetNames.size === 0 ? ["target adapter declares no dependencies"] : [];
		return {
			validator: "dependencies",
			valid: differences.length === 0,
			lossiness: differences.length === 0 ? "lossless" : "unsupported",
			differences,
		};
	},
};

const streamingValidator: StyleValidator = {
	schema: VALIDATOR_SCHEMA,
	id: "rsc-streaming",
	validate: ({ streaming }) => {
		if (streaming === undefined)
			return { validator: "rsc-streaming", valid: true, lossiness: "lossless", differences: [] };
		const differences =
			streaming.source.length !== streaming.target.length ||
			streaming.source.some((chunk, index) => chunk !== streaming.target[index])
				? ["RSC streaming chunks differ"]
				: [];
		return {
			validator: "rsc-streaming",
			valid: differences.length === 0,
			lossiness: differences.length === 0 ? "lossless" : "unsupported",
			differences,
		};
	},
};

export function createStyleValidatorRegistry(
	initial: readonly StyleValidator[] = [
		canonicalValidator,
		residualValidator,
		browserValidator,
		ssrValidator,
		dependencyValidator,
		streamingValidator,
	],
): StyleValidatorRegistry {
	const validators = new Map<string, StyleValidator>();
	const registry: StyleValidatorRegistry = {
		get validators() {
			return [...validators.values()];
		},
		register(validator) {
			if (validator.schema !== VALIDATOR_SCHEMA)
				throw new Error(`unsupported validator schema: ${validator.schema}`);
			if (validators.has(validator.id))
				throw new Error(`validator already registered: ${validator.id}`);
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
