import type { ClassNameStrategy } from "../css/class-name-strategy.ts";
import {
	isValidCascadeLayerName,
	resolveCssCascade,
	type CssCascade,
	type CssCascadeMode,
} from "../css/cascade.ts";
import murmurHash from "../lib/murmur-hash2.ts";
import type { CssConfigReturn, TokenDeclaration } from "../types/typings.ts";

export const YUMCSS_LIB_SCHEMA = "yumcss.lib/1" as const;
export const YUMCSS_LIB_COMPILER = "yumcss-css/1" as const;
export const YUMCSS_LIB_GENERATOR = "yumcss-codemod lib build" as const;

export type YumCSSLibRule = {
	readonly id: string;
	readonly css: string;
	readonly priority: number;
};

export interface YumCSSLibCompatibility {
	readonly compiler: typeof YUMCSS_LIB_COMPILER;
	readonly preset: string;
	readonly className: "default";
	readonly namespace: string;
	readonly cascade: CssCascadeMode | null;
	readonly cascadeLayer: string | null;
}

export interface YumCSSLibSource {
	readonly path: string;
	readonly hash: string;
}

export interface YumCSSLibArtifact {
	readonly schema: typeof YUMCSS_LIB_SCHEMA;
	readonly generator: typeof YUMCSS_LIB_GENERATOR;
	readonly hash: string;
	readonly compatibility: YumCSSLibCompatibility;
	readonly sources: readonly YumCSSLibSource[];
	readonly tokens: readonly TokenDeclaration[];
	readonly web: string;
	readonly rules: {
		readonly atomic: readonly YumCSSLibRule[];
		readonly vars: readonly YumCSSLibRule[];
	};
}

export interface YumCSSLibArtifactInput {
	readonly compatibility: YumCSSLibCompatibility;
	readonly sources: readonly YumCSSLibSource[];
	readonly tokens: readonly TokenDeclaration[];
	readonly web: string;
	readonly atomic: readonly YumCSSLibRule[];
	readonly vars: readonly YumCSSLibRule[];
}

export interface YumCSSLibCompatibilityOptions {
	readonly namespace?: string;
	readonly cascade?: CssCascade;
	readonly className?: ClassNameStrategy;
}

export interface YumCSSLibCompatibilityCheck {
	readonly compatible: boolean;
	readonly differences: readonly string[];
}

export interface YumCSSLibValidation {
	readonly valid: boolean;
	readonly artifact?: YumCSSLibArtifact;
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

const isStableScalar = (value: unknown): value is string | boolean | number =>
	typeof value === "string" || typeof value === "boolean" || typeof value === "number";

const stableValue = (value: unknown): StableValue | undefined => {
	if (value === undefined) return;
	if (value === null) return null;
	if (isStableScalar(value)) return value;
	if (Array.isArray(value)) return value.map((entry) => stableValue(entry) ?? null);
	if (isRecord(value)) {
		return Object.fromEntries(
			Object.keys(value)
				.toSorted()
				.flatMap((key) => {
					const normalized = stableValue(value[key]);
					return normalized === undefined ? [] : [[key, normalized]];
				}),
		);
	}
	throw new TypeError("YumCSS lib compatibility values must be JSON-serializable");
};

const stableStringify = (value: unknown): string => JSON.stringify(stableValue(value) ?? null);

const hashValue = (value: unknown): string => murmurHash(stableStringify(value));

export const hashYumCSSLibSource = (source: string): string => hashValue(source);

export const createYumCSSLibCompatibility = (
	preset: CssConfigReturn,
	options: YumCSSLibCompatibilityOptions = {},
): YumCSSLibCompatibility => {
	if (options.className !== undefined) {
		throw new Error(
			"YumCSS lib artifacts currently require the default class-name strategy; " +
				"external compiler strategies need their own compatibility contract",
		);
	}
	const cascade = resolveCssCascade(options.cascade);
	return {
		compiler: YUMCSS_LIB_COMPILER,
		preset: hashValue({
			conditions: preset.conditions,
			properties: preset.properties,
			strict: preset.strict,
			colorPalettes: preset.colorPalettes ?? null,
			tokens: preset.tokens,
			web: preset.web ?? null,
		}),
		className: "default",
		namespace: options.namespace ?? "pw",
		cascade: cascade.mode ?? null,
		cascadeLayer: cascade.layer ?? null,
	};
};

const artifactContent = (input: YumCSSLibArtifactInput) => ({
	schema: YUMCSS_LIB_SCHEMA,
	generator: YUMCSS_LIB_GENERATOR,
	compatibility: input.compatibility,
	sources: input.sources.toSorted((left, right) => left.path.localeCompare(right.path)),
	tokens: input.tokens.toSorted((left, right) => {
		const priority = left.priority - right.priority;
		return priority === 0 ? left.declaration.localeCompare(right.declaration) : priority;
	}),
	web: input.web,
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

export const createYumCSSLibArtifact = (input: YumCSSLibArtifactInput): YumCSSLibArtifact => {
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
	if (value.compiler !== YUMCSS_LIB_COMPILER)
		errors.push(`compatibility.compiler must be ${YUMCSS_LIB_COMPILER}`);
	if (typeof value.preset !== "string" || value.preset.length === 0)
		errors.push("compatibility.preset must be a non-empty string");
	if (value.className !== "default") errors.push("compatibility.className must be default");
	if (typeof value.namespace !== "string" || value.namespace.length === 0)
		errors.push("compatibility.namespace must be a non-empty string");
	if (value.cascade !== null && value.cascade !== "specificity" && value.cascade !== "layers")
		errors.push("compatibility.cascade must be null, specificity, or layers");
	if (value.cascade === "layers") {
		if (typeof value.cascadeLayer !== "string" || !isValidCascadeLayerName(value.cascadeLayer))
			errors.push(
				"compatibility.cascadeLayer must be a valid dotted CSS identifier path for layers",
			);
	} else if (value.cascadeLayer !== null) {
		errors.push("compatibility.cascadeLayer must be null unless cascade is layers");
	}
	return errors;
};

export const validateYumCSSLibArtifact = (value: unknown): YumCSSLibValidation => {
	if (!isRecord(value)) return { valid: false, errors: ["artifact must be an object"] };
	const errors = [
		...(value.schema !== YUMCSS_LIB_SCHEMA ? [`artifact.schema must be ${YUMCSS_LIB_SCHEMA}`] : []),
		...(value.generator !== YUMCSS_LIB_GENERATOR
			? [`artifact.generator must be ${YUMCSS_LIB_GENERATOR}`]
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
	if (typeof value.web !== "string") errors.push("web must be a string");

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
	// SAFETY: every artifact field has passed its corresponding validator above.
	const artifact = value as unknown as YumCSSLibArtifact;
	const { hash: _hash, ...content } = artifact;
	if (artifact.hash !== hashValue(content))
		return { valid: false, errors: ["artifact.hash does not match its content"] };
	return { valid: true, artifact, errors: [] };
};

export const checkYumCSSLibCompatibility = (
	artifact: YumCSSLibArtifact,
	preset: CssConfigReturn,
	options: YumCSSLibCompatibilityOptions = {},
): YumCSSLibCompatibilityCheck => {
	try {
		const expected = createYumCSSLibCompatibility(preset, options);
		const differences = Object.entries(expected).flatMap(([key, value]) =>
			artifact.compatibility[key as keyof YumCSSLibCompatibility] === value
				? []
				: [
						`${key} differs (artifact=${String(artifact.compatibility[key as keyof YumCSSLibCompatibility])}, consumer=${String(value)})`,
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
