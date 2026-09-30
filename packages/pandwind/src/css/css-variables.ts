import type { CssVariableDescriptor, CssVariables } from "../types/typings.ts";

interface CssVariableValueEntry {
	readonly name: string;
	readonly condition: string;
	readonly value: string;
}

interface CssVariableRegistration {
	readonly name: string;
	readonly descriptor: CssVariableDescriptor;
}

export interface NormalizedCssVariables {
	readonly values: readonly CssVariableValueEntry[];
	readonly registrations: readonly CssVariableRegistration[];
}

/** CSS grammar descriptors are string values in an `@property` rule. */
export const serializeCssPropertySyntax = (syntax: string): string => {
	const trimmed = syntax.trim();
	if (
		trimmed.length >= 2 &&
		((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
			(trimmed.startsWith("'") && trimmed.endsWith("'")))
	)
		return trimmed;
	return JSON.stringify(syntax);
};

const isDescriptor = (value: object): value is CssVariableDescriptor =>
	"syntax" in value && "inherits" in value && "initialValue" in value;

/** Normalize flat preset variables without interpreting condition names. */
export const normalizeCssVariables = (
	variables: CssVariables | undefined,
): NormalizedCssVariables => {
	const values: CssVariableValueEntry[] = [];
	const registrations: CssVariableRegistration[] = [];
	for (const [name, value] of Object.entries(variables ?? {})) {
		if (typeof value === "string") {
			values.push({ name, condition: "base", value });
			continue;
		}
		if (isDescriptor(value)) {
			registrations.push({ name, descriptor: value });
			continue;
		}
		for (const [condition, conditionValue] of Object.entries(value)) {
			values.push({ name, condition, value: conditionValue });
		}
	}
	return { values, registrations };
};
