import type { ClassNameStrategy } from "../css/class-name-strategy.ts";
import type { CssCascadeMode } from "../css/cascade.ts";
import murmurHash from "../lib/murmur-hash2.ts";
import type { CssConfigReturn, TokenDeclaration } from "../types/typings.ts";

export const PANDWIND_LIB_SCHEMA = "pandwind.lib/1" as const;
export const PANDWIND_LIB_COMPILER = "pandwind-css/1" as const;
export const PANDWIND_LIB_GENERATOR = "pandwind-codemod lib build" as const;

export type PandwindLibRule = {
	readonly id: string;
	readonly css: string;
	readonly priority: number;
};

export interface PandwindLibCompatibility {
	readonly compiler: typeof PANDWIND_LIB_COMPILER;
	readonly preset: string;
	readonly className: "default";
	readonly namespace: string;
	readonly cascade: CssCascadeMode | null;
}

export interface PandwindLibSource {
	readonly path: string;
	readonly hash: string;
}

export interface PandwindLibArtifact {
	readonly schema: typeof PANDWIND_LIB_SCHEMA;
	readonly generator: typeof PANDWIND_LIB_GENERATOR;
	readonly hash: string;
	readonly compatibility: PandwindLibCompatibility;
	readonly sources: readonly PandwindLibSource[];
	readonly tokens: readonly TokenDeclaration[];
	readonly rules: {
		readonly atomic: readonly PandwindLibRule[];
		readonly vars: readonly PandwindLibRule[];
	};
}

export interface PandwindLibArtifactInput {
	readonly compatibility: PandwindLibCompatibility;
	readonly sources: readonly PandwindLibSource[];
	readonly tokens: readonly TokenDeclaration[];
	readonly atomic: readonly PandwindLibRule[];
	readonly vars: readonly PandwindLibRule[];
}

export interface PandwindLibCompatibilityOptions {
	readonly namespace?: string;
	readonly cascade?: CssCascadeMode;
	readonly className?: ClassNameStrategy;
}

export interface PandwindLibCompatibilityCheck {
	readonly compatible: boolean;
	readonly differences: readonly string[];
}

export interface PandwindLibValidation {
	readonly valid: boolean;
	readonly artifact?: PandwindLibArtifact;
	readonly errors: readonly string[];
}

type StableValue =
	| null
	| boolean
	| number
	| string
	| readonly StableValue[]
	| {
			readonly [key: string]: StableValue;
	  };

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const stableValue = (value: unknown): StableValue => {
	if (value === null) return null;
	if (typeof value === "string" || typeof value === "boolean" || typeof value === "number")
		return value;
	if (Array.isArray(value)) return value.map(stableValue);
	if (isRecord(value)) {
		return Object.fromEntries(
			Object.keys(value)
				.toSorted()
				.map((key) => [key, stableValue(value[key])] as const),
		);
	}
	throw new TypeError("Pandwind lib compatibility values must be JSON-serializable");
};

const stableStringify = (value: unknown): string => JSON.stringify(stableValue(value));

const hashValue = (value: unknown): string => murmurHash(stableStringify(value));

export const hashPandwindLibSource = (source: string): string => hashValue(source);

export const createPandwindLibCompatibility = (
	preset: CssConfigReturn,
	options: PandwindLibCompatibilityOptions = {},
): PandwindLibCompatibility => {
	if (options.className !== undefined) {
		throw new Error(
			"Pandwind lib artifacts currently require the default class-name strategy; " +
				"external compiler strategies need their own compatibility contract",
		);
	}
	return {
		compiler: PANDWIND_LIB_COMPILER,
		preset: hashValue({
			conditions: preset.conditions,
			properties: preset.properties,
			strict: preset.strict,
			colorPalettes: preset.colorPalettes ?? null,
			tokens: preset.tokens,
		}),
		className: "default",
		namespace: options.namespace ?? "pw",
		cascade: options.cascade ?? null,
	};
};

const artifactContent = (input: PandwindLibArtifactInput) => ({
	schema: PANDWIND_LIB_SCHEMA,
	generator: PANDWIND_LIB_GENERATOR,
	compatibility: input.compatibility,
	sources: input.sources.toSorted((left, right) => left.path.localeCompare(right.path)),
	tokens: input.tokens.toSorted((left, right) => {
		const priority = left.priority - right.priority;
		return priority === 0 ? left.declaration.localeCompare(right.declaration) : priority;
	}),
	rules: {
		atomic: input.atomic.toSorted((left, right) => {
			const priority = left.priority - right.priority;
			return priority === 0 ? left.id.localeCompare(right.id) : priority;
		}),
		vars: input.vars.toSorted((left, right) => {
			const priority = left.priority - right.priority;
			return priority === 0 ? left.id.localeCompare(right.id) : priority;
		}),
	},
});

export const createPandwindLibArtifact = (input: PandwindLibArtifactInput): PandwindLibArtifact => {
	const content = artifactContent(input);
	return { ...content, hash: hashValue(content) };
};

const isFiniteNumber = (value: unknown): value is number =>
	typeof value === "number" && Number.isFinite(value);

const validateRule = (value: unknown, label: string): string[] => {
	if (!isRecord(value)) return [`${label} must be an object`];
	const errors: string[] = [];
	if (typeof value.id !== "string" || value.id.length === 0)
		errors.push(`${label}.id must be a non-empty string`);
	if (typeof value.css !== "string" || value.css.length === 0)
		errors.push(`${label}.css must be a non-empty string`);
	if (!isFiniteNumber(value.priority)) errors.push(`${label}.priority must be a finite number`);
	return errors;
};

const validateToken = (value: unknown, label: string): string[] => {
	if (!isRecord(value)) return [`${label} must be an object`];
	const errors: string[] = [];
	if (typeof value.declaration !== "string" || value.declaration.length === 0)
		errors.push(`${label}.declaration must be a non-empty string`);
	if (!isFiniteNumber(value.priority)) errors.push(`${label}.priority must be a finite number`);
	return errors;
};

const validateCompatibility = (value: unknown): string[] => {
	if (!isRecord(value)) return ["compatibility must be an object"];
	const errors: string[] = [];
	if (value.compiler !== PANDWIND_LIB_COMPILER)
		errors.push(`compatibility.compiler must be ${PANDWIND_LIB_COMPILER}`);
	if (typeof value.preset !== "string" || value.preset.length === 0)
		errors.push("compatibility.preset must be a non-empty string");
	if (value.className !== "default") errors.push("compatibility.className must be default");
	if (typeof value.namespace !== "string" || value.namespace.length === 0)
		errors.push("compatibility.namespace must be a non-empty string");
	if (value.cascade !== null && value.cascade !== "specificity" && value.cascade !== "layers")
		errors.push("compatibility.cascade must be null, specificity, or layers");
	return errors;
};

export const validatePandwindLibArtifact = (value: unknown): PandwindLibValidation => {
	if (!isRecord(value)) return { valid: false, errors: ["artifact must be an object"] };
	const errors = [
		...(value.schema !== PANDWIND_LIB_SCHEMA
			? [`artifact.schema must be ${PANDWIND_LIB_SCHEMA}`]
			: []),
		...(value.generator !== PANDWIND_LIB_GENERATOR
			? [`artifact.generator must be ${PANDWIND_LIB_GENERATOR}`]
			: []),
		...(typeof value.hash !== "string" || value.hash.length === 0
			? ["artifact.hash must be a non-empty string"]
			: []),
		...validateCompatibility(value.compatibility),
	];

	if (!Array.isArray(value.sources)) errors.push("sources must be an array");
	else {
		for (const [index, source] of value.sources.entries()) {
			if (!isRecord(source)) {
				errors.push(`sources[${index}] must be an object`);
				continue;
			}
			if (typeof source.path !== "string" || source.path.length === 0)
				errors.push(`sources[${index}].path must be a non-empty string`);
			if (typeof source.hash !== "string" || source.hash.length === 0)
				errors.push(`sources[${index}].hash must be a non-empty string`);
		}
	}

	if (!Array.isArray(value.tokens)) errors.push("tokens must be an array");
	else
		for (const [index, token] of value.tokens.entries())
			errors.push(...validateToken(token, `tokens[${index}]`));

	if (!isRecord(value.rules)) errors.push("rules must be an object");
	else {
		for (const kind of ["atomic", "vars"] as const) {
			const rules = value.rules[kind];
			if (!Array.isArray(rules)) {
				errors.push(`rules.${kind} must be an array`);
				continue;
			}
			for (const [index, rule] of rules.entries())
				errors.push(...validateRule(rule, `rules.${kind}[${index}]`));
		}
	}

	if (errors.length > 0) return { valid: false, errors };
	const artifact = value as unknown as PandwindLibArtifact;
	const { hash: _hash, ...content } = artifact;
	if (artifact.hash !== hashValue(content))
		return { valid: false, errors: ["artifact.hash does not match its content"] };
	return { valid: true, artifact, errors: [] };
};

export const checkPandwindLibCompatibility = (
	artifact: PandwindLibArtifact,
	preset: CssConfigReturn,
	options: PandwindLibCompatibilityOptions = {},
): PandwindLibCompatibilityCheck => {
	try {
		const expected = createPandwindLibCompatibility(preset, options);
		const differences = Object.entries(expected).flatMap(([key, value]) =>
			artifact.compatibility[key as keyof PandwindLibCompatibility] === value
				? []
				: [
						`${key} differs (artifact=${String(artifact.compatibility[key as keyof PandwindLibCompatibility])}, consumer=${String(value)})`,
					],
		);
		return { compatible: differences.length === 0, differences };
	} catch (error) {
		return {
			compatible: false,
			differences: [error instanceof Error ? error.message : String(error)],
		};
	}
};
