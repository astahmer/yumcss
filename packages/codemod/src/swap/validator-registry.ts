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
import { StyleValidatorId, type StyleValidatorIdentifier } from "./identifiers.ts";

export const VALIDATOR_SCHEMA = "pandwind.style-validator/1" as const;
export const VALIDATOR_PLUGIN_SCHEMA = "pandwind.style-validator-plugin/1" as const;

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
	readonly id: StyleValidatorIdentifier;
	validate(context: StyleValidationContext): StyleValidationEvidence;
}

export interface StyleValidatorPlugin {
	readonly schema: typeof VALIDATOR_PLUGIN_SCHEMA;
	readonly id: StyleValidatorIdentifier;
	readonly validators: readonly StyleValidator[];
}

export interface StyleValidatorRegistry {
	readonly plugins: readonly StyleValidatorPlugin[];
	readonly validators: readonly StyleValidator[];
	register(validator: StyleValidator): StyleValidatorRegistry;
	registerPlugin(plugin: StyleValidatorPlugin): StyleValidatorRegistry;
	validate(context: StyleValidationContext): AdapterValidationResult;
}

const canonicalValidator: StyleValidator = {
	schema: VALIDATOR_SCHEMA,
	id: StyleValidatorId.CanonicalCss,
	validate: ({ source, target }) => {
		const canonicalSource = styleProgramToCanonicalCss(source);
		const canonicalTarget = styleProgramToCanonicalCss(target);
		return {
			validator: StyleValidatorId.CanonicalCss,
			valid: canonicalSource === canonicalTarget,
			lossiness: canonicalSource === canonicalTarget ? "lossless" : "unsupported",
			differences: canonicalSource === canonicalTarget ? [] : ["canonical CSS differs"],
		};
	},
};

const residualValidator: StyleValidator = {
	schema: VALIDATOR_SCHEMA,
	id: StyleValidatorId.Residuals,
	validate: ({ residuals }) => ({
		validator: StyleValidatorId.Residuals,
		valid: residuals.length === 0,
		lossiness: residuals.length === 0 ? "lossless" : "lossy",
		differences: residuals.length === 0 ? [] : [`${residuals.length} residual conversion(s)`],
		residuals,
	}),
};

const browserValidator: StyleValidator = {
	schema: VALIDATOR_SCHEMA,
	id: StyleValidatorId.BrowserStates,
	validate: ({ browser }) => {
		if (browser === undefined || browser.length === 0)
			return {
				validator: StyleValidatorId.BrowserStates,
				valid: true,
				lossiness: "lossless",
				differences: [],
			};
		const differences = browser
			.filter((state) => state.source !== state.target)
			.map((state) => `browser state differs: ${state.name}`);
		return {
			validator: StyleValidatorId.BrowserStates,
			valid: differences.length === 0,
			lossiness: differences.length === 0 ? "lossless" : "unsupported",
			differences,
		};
	},
};

const ssrValidator: StyleValidator = {
	schema: VALIDATOR_SCHEMA,
	id: StyleValidatorId.SsrHydration,
	validate: ({ ssr }) => {
		if (ssr === undefined)
			return {
				validator: StyleValidatorId.SsrHydration,
				valid: true,
				lossiness: "lossless",
				differences: [],
			};
		const differences: string[] = [];
		if (ssr.source.server.html !== ssr.target.server.html) differences.push("SSR HTML differs");
		if (ssr.source.server.css !== ssr.target.server.css) differences.push("SSR CSS differs");
		if (ssr.source.hydrated.html !== ssr.target.hydrated.html)
			differences.push("hydrated HTML differs");
		if (ssr.source.hydrated.css !== ssr.target.hydrated.css)
			differences.push("hydrated CSS differs");
		return {
			validator: StyleValidatorId.SsrHydration,
			valid: differences.length === 0,
			lossiness: differences.length === 0 ? "lossless" : "unsupported",
			differences,
		};
	},
};

const dependencyValidator: StyleValidator = {
	schema: VALIDATOR_SCHEMA,
	id: StyleValidatorId.Dependencies,
	validate: ({ dependencies }) => {
		if (dependencies === undefined)
			return {
				validator: StyleValidatorId.Dependencies,
				valid: true,
				lossiness: "lossless",
				differences: [],
			};
		const targetNames = new Set(dependencies.target.packages.map((dependency) => dependency.name));
		const differences = targetNames.size === 0 ? ["target adapter declares no dependencies"] : [];
		return {
			validator: StyleValidatorId.Dependencies,
			valid: differences.length === 0,
			lossiness: differences.length === 0 ? "lossless" : "unsupported",
			differences,
		};
	},
};

const streamingValidator: StyleValidator = {
	schema: VALIDATOR_SCHEMA,
	id: StyleValidatorId.RscStreaming,
	validate: ({ streaming }) => {
		if (streaming === undefined)
			return {
				validator: StyleValidatorId.RscStreaming,
				valid: true,
				lossiness: "lossless",
				differences: [],
			};
		const differences =
			streaming.source.length !== streaming.target.length ||
			streaming.source.some((chunk, index) => chunk !== streaming.target[index])
				? ["RSC streaming chunks differ"]
				: [];
		return {
			validator: StyleValidatorId.RscStreaming,
			valid: differences.length === 0,
			lossiness: differences.length === 0 ? "lossless" : "unsupported",
			differences,
		};
	},
};

export const BUILTIN_STYLE_VALIDATOR_PLUGIN: StyleValidatorPlugin = {
	schema: VALIDATOR_PLUGIN_SCHEMA,
	id: StyleValidatorId.Builtin,
	validators: [
		canonicalValidator,
		residualValidator,
		browserValidator,
		ssrValidator,
		dependencyValidator,
		streamingValidator,
	],
};

export function createStyleValidatorRegistry(
	initial?: readonly StyleValidator[],
): StyleValidatorRegistry {
	const validators = new Map<string, StyleValidator>();
	const plugins = new Map<string, StyleValidatorPlugin>();
	const registry: StyleValidatorRegistry = {
		get plugins() {
			return [...plugins.values()];
		},
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
		registerPlugin(plugin) {
			if (plugin.schema !== VALIDATOR_PLUGIN_SCHEMA)
				throw new Error(`unsupported validator plugin schema: ${plugin.schema}`);
			if (plugins.has(plugin.id))
				throw new Error(`validator plugin already registered: ${plugin.id}`);
			plugins.set(plugin.id, plugin);
			for (const validator of plugin.validators) registry.register(validator);
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
	if (initial === undefined) registry.registerPlugin(BUILTIN_STYLE_VALIDATOR_PLUGIN);
	else for (const validator of initial) registry.register(validator);
	return registry;
}

export const STYLE_VALIDATORS = createStyleValidatorRegistry();
