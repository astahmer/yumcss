import type { PlaygroundStyleMapping } from "./eval-playground.ts";
import type { PlaygroundPreviewKind } from "./examples.ts";

interface PreviewExplanationResult {
	styleMappings: readonly PlaygroundStyleMapping[];
	killed: readonly string[];
	runtimeStyle?: Readonly<Record<string, string>>;
	fold?: "full" | "partial" | "runtime";
	sheets?: readonly { rules: readonly unknown[] }[];
}

interface PreviewExplanationInput {
	kind: PlaygroundPreviewKind;
	result: PreviewExplanationResult;
	style: Readonly<Record<string, string>>;
	description: string;
}

const CSS_PROPERTY_ALIASES: Readonly<Record<string, string>> = {
	bgColor: "background-color",
	backgroundColor: "background-color",
	fill: "background-color",
	textColor: "color",
	color: "color",
	p: "padding",
	pad: "padding",
	padding: "padding",
	rounded: "border-radius",
	corners: "border-radius",
	borderRadius: "border-radius",
	textSize: "font-size",
	fontSize: "font-size",
};

const toCssProperty = (property: string): string => {
	return (
		CSS_PROPERTY_ALIASES[property] ??
		property.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)
	);
};

const toStyleProperty = (property: string): string =>
	property.replace(/-([a-z])/gu, (_, letter: string) => letter.toUpperCase());

const isColorProperty = (property: string): boolean => {
	const cssProperty = toCssProperty(property);
	return (
		cssProperty === "color" ||
		cssProperty === "background-color" ||
		cssProperty.endsWith("-color") ||
		cssProperty === "fill" ||
		cssProperty === "stroke"
	);
};

const colorPropertyLabel = (property: string): string => {
	const cssProperty = toCssProperty(property);
	if (cssProperty.startsWith("--")) return "runtime color";
	if (cssProperty === "color") return "text color";
	if (cssProperty === "fill" || cssProperty === "stroke") return `${cssProperty} color`;
	if (cssProperty === "background-color") return "background color";
	return cssProperty.replaceAll("-", " ");
};

const propertyLabel = (property: string): string => {
	const cssProperty = toCssProperty(property);
	if (cssProperty === "background-color") return "background color";
	if (cssProperty === "color") return "text color";
	if (cssProperty === "border-radius") return "border radius";
	if (cssProperty === "font-size") return "font size";
	if (cssProperty === "display") return "display mode";
	return cssProperty.replaceAll("-", " ");
};

const displayValue = (
	mapping: PlaygroundStyleMapping,
	property: string,
	style: Readonly<Record<string, string>>,
): string => {
	const resolved = style[property] ?? style[toStyleProperty(property)];
	if (mapping.value === "") return resolved ?? "the generated value";
	if (resolved === undefined || resolved === mapping.value || resolved.startsWith("var("))
		return mapping.value;
	return `${mapping.value} (${resolved})`;
};

const declarationLabel = (mapping: PlaygroundStyleMapping): string => {
	if (mapping.value === "") return mapping.className;
	return mapping.value.includes(".") ? `token ref ${mapping.value}` : mapping.value;
};

const findLastActive = (mappings: readonly PlaygroundStyleMapping[]): number => {
	for (let index = mappings.length - 1; index >= 0; index -= 1) {
		if (mappings[index]?.active === true) return index;
	}
	return -1;
};

const runtimeColor = (
	runtimeStyle: Readonly<Record<string, string>> | undefined,
): [string, string] | undefined => {
	for (const [property, value] of Object.entries(runtimeStyle ?? {})) {
		if (/color|fill|stroke/u.test(property)) return [property, value];
	}
	return undefined;
};

const VISIBLE_PROPERTY_ORDER = [
	"background-color",
	"color",
	"padding",
	"border-radius",
	"font-size",
	"display",
	"gap",
	"margin",
] as const;

const foldExplanation = (fold: PreviewExplanationResult["fold"]): string | undefined => {
	if (fold === "full") return "the build-time fold precomputes this style";
	if (fold === "partial") return "static pieces fold while runtime choices remain";
	if (fold === "runtime") return "some values are only known at runtime";
	return undefined;
};

const isStateCondition = (condition: string): boolean =>
	condition.startsWith("_") || /(?:hover|focus|active|disabled|visited|group)/u.test(condition);

const conditionLabel = (condition: string): string =>
	condition.startsWith("_") ? condition.slice(1) : condition;

const hasRenderedStyle = (
	mapping: PlaygroundStyleMapping,
	style: Readonly<Record<string, string>>,
): boolean => {
	const property = toCssProperty(mapping.property);
	return (
		style[property] !== undefined ||
		style[toStyleProperty(property)] !== undefined ||
		isColorProperty(mapping.property) ||
		VISIBLE_PROPERTY_ORDER.some((visibleProperty) => visibleProperty === property)
	);
};

export const explainPreview = (input: PreviewExplanationInput): string => {
	const baseMappings = input.result.styleMappings.filter(
		(mapping) => mapping.conditions.length === 0 && hasRenderedStyle(mapping, input.style),
	);
	const colorMappings = baseMappings.filter((mapping) => isColorProperty(mapping.property));
	const backgroundMappings = colorMappings.filter(
		(mapping) => toCssProperty(mapping.property) === "background-color",
	);
	const colorCandidates = backgroundMappings.length > 0 ? backgroundMappings : colorMappings;
	const visibleProperty = VISIBLE_PROPERTY_ORDER.find((property) =>
		baseMappings.some((mapping) => toCssProperty(mapping.property) === property),
	);
	const candidates =
		colorCandidates.length > 0
			? colorCandidates
			: visibleProperty === undefined
				? baseMappings
				: baseMappings.filter((mapping) => toCssProperty(mapping.property) === visibleProperty);
	const activeIndex = findLastActive(candidates);

	if (activeIndex >= 0) {
		const mapping = candidates[activeIndex];
		if (mapping === undefined) return `${input.kind} preview has no color declaration.`;
		const property = toCssProperty(mapping.property);
		const previous = candidates.slice(0, activeIndex);
		const dropped = previous.filter((candidate) => !candidate.active);
		const surviving = previous.filter((candidate) => candidate.active);
		const value = displayValue(mapping, property, input.style);
		const label = isColorProperty(mapping.property)
			? colorPropertyLabel(mapping.property)
			: propertyLabel(mapping.property);
		let reason = `the ${declarationLabel(mapping)} declaration sets the ${label}`;
		if (dropped.length > 0) {
			const droppedValues = dropped.map(declarationLabel).join(", ");
			const conflictLabel = dropped.some((candidate) =>
				input.result.killed.includes(candidate.className),
			)
				? "conflict resolution"
				: "the generated style program";
			reason = `the ${declarationLabel(mapping)} declaration survived ${conflictLabel} while ${droppedValues} was dropped`;
		} else if (surviving.length > 0) {
			const survivingValues = surviving.map(declarationLabel).join(", ");
			reason = `the later ${declarationLabel(mapping)} declaration overrides ${survivingValues}`;
		}
		const conditions = input.result.styleMappings
			.filter(
				(candidate) =>
					candidate.active &&
					candidate.conditions.length > 0 &&
					toCssProperty(candidate.property) === property,
			)
			.flatMap((candidate) => candidate.conditions);
		const stateVariants = [...new Set(conditions.filter(isStateCondition).map(conditionLabel))];
		const responsiveVariants = [
			...new Set(conditions.filter((condition) => !isStateCondition(condition))),
		];
		if (stateVariants.length > 0)
			reason += `; state variants ${stateVariants.join(", ")} are also generated`;
		if (responsiveVariants.length > 0)
			reason += `; responsive variants ${responsiveVariants.join(", ")} are also generated`;
		if (
			!isColorProperty(mapping.property) &&
			stateVariants.length === 0 &&
			responsiveVariants.length === 0
		) {
			const fold = foldExplanation(input.result.fold);
			if (fold !== undefined) reason += `; ${fold}`;
		}
		const runtime = runtimeColor(input.result.runtimeStyle);
		if (runtime !== undefined)
			reason += `; runtime color ${runtime[1]} is carried through the host style`;
		return `${input.kind} uses ${value} for its ${label} because ${reason}.`;
	}

	const runtime = runtimeColor(input.result.runtimeStyle);
	if (runtime !== undefined) {
		const [property, value] = runtime;
		return `${input.kind} uses ${value} for its ${colorPropertyLabel(property)} because the runtime style supplies ${property}.`;
	}

	if (input.result.sheets?.some((sheet) => sheet.rules.length > 0))
		return `${input.kind} uses generated stylesheet rules. ${input.description}`;

	return `${input.kind} has no generated style declaration. ${input.description}`;
};
