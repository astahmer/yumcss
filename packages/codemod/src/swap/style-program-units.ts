import unitlessProperties from "@emotion/unitless";
import { StyleValueKindTag, type StyleProgram } from "./semantic-ir.ts";

const camelProperty = (property: string): string =>
	property.replace(/-([a-z])/gu, (_match, character: string) => character.toUpperCase());

const withCssLengthUnit = (
	declaration: StyleProgram["declarations"][number],
	lengthProperties: ReadonlySet<string>,
) => {
	const value = declaration.value;
	if (
		value.kind !== StyleValueKindTag.Literal ||
		typeof value.value !== "number" ||
		!Number.isFinite(value.value) ||
		value.value === 0 ||
		declaration.property.startsWith("--") ||
		(unitlessProperties[camelProperty(declaration.property)] === 1 &&
			!lengthProperties.has(declaration.property))
	)
		return declaration;
	return { ...declaration, value: { ...value, value: `${value.value}px` } };
};

/** Resolve CSS-in-JS numeric object values to the CSS units they serialize as. */
export const normalizeCssObjectNumericUnits = (
	program: StyleProgram,
	lengthProperties: ReadonlySet<string> = new Set(),
): StyleProgram => {
	const mapRule = (rule: StyleProgram["rules"][number]): StyleProgram["rules"][number] => ({
		...rule,
		declarations: rule.declarations.map((declaration) =>
			withCssLengthUnit(declaration, lengthProperties),
		),
		children: rule.children.map(mapRule),
	});
	return {
		...program,
		declarations: program.declarations.map((declaration) =>
			withCssLengthUnit(declaration, lengthProperties),
		),
		rules: program.rules.map(mapRule),
	};
};
