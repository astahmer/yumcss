import { StyleProgramCompositionKind } from "../identifiers.ts";
import {
	SemanticConditionKindTag,
	StyleProgramResidualKindTag,
	type StyleProgram,
} from "../semantic-ir.ts";
import type { AdapterRenderers, AdapterSourceObjectOptions } from "../external-adapters.ts";

const unsupportedRecipeKeys = new Set([
	"className",
	"compoundVariants",
	"defaultVariants",
	"slots",
	"slotVariants",
]);

/** Parse the shared static subset of the recipe object dialects. */
export const recipeSourceObjectOptions = (): AdapterSourceObjectOptions => ({
	variantContainerKeys: ["variants"],
	compositions: [{ kind: StyleProgramCompositionKind.Recipe, reference: "variants" }],
});

/** Render the common static recipe subset for any target recipe carrier. */
export function recipeDefinitionObject(
	program: StyleProgram,
	declarationsObject: AdapterRenderers["declarationsObject"],
): string {
	const base = declarationsObject(
		program.declarations.filter((declaration) => declaration.conditions.length === 0),
	);
	const variants = new Map<string, Map<string, typeof program.declarations>>();
	for (const declaration of program.declarations) {
		const [variant, value] = declaration.conditions;
		if (
			variant?.kind !== SemanticConditionKindTag.Named ||
			value?.kind !== SemanticConditionKindTag.Named
		)
			continue;
		const values = variants.get(variant.name) ?? new Map();
		const declarations = values.get(value.name) ?? [];
		values.set(value.name, [...declarations, { ...declaration, conditions: [] }]);
		variants.set(variant.name, values);
	}
	const variantText = [...variants].map(
		([name, values]) =>
			`${JSON.stringify(name)}: { ${[...values]
				.map(
					([value, declarations]) =>
						`${JSON.stringify(value)}: ${declarationsObject(declarations)}`,
				)
				.join(", ")} }`,
	);
	return `{ base: ${base}, variants: { ${variantText.join(", ")} } }`;
}

/** Parse Panda slot recipes as named slot rules plus named variant conditions. */
export const slotRecipeSourceObjectOptions = (): AdapterSourceObjectOptions => ({
	namedRuleObjects: true,
	variantContainerKeys: ["variants"],
	ignoredObjectKeys: ["slots"],
	compositions: [{ kind: StyleProgramCompositionKind.Slot, reference: "slots" }],
});

/** Parse Pandwind's runtime slot-recipe carrier back into named slot rules. */
export const pandwindSlotRecipeSourceObjectOptions = (): AdapterSourceObjectOptions => ({
	namedRuleObjects: true,
	variantContainerKeys: ["slotVariants"],
	unwrapNestedObjectKeys: ["slots"],
	compositions: [{ kind: StyleProgramCompositionKind.Slot, reference: "slots" }],
});

/** Retain Panda's explicit slot list while keeping it out of style declarations. */
export function captureSlotRecipeSlots(program: StyleProgram, source: string): StyleProgram {
	const start = program.source?.start ?? 0;
	const end = program.source?.end ?? source.length;
	const authored = source.slice(start, end);
	const values = /\bslots\s*:\s*\[([^\]]*)\]/u.exec(authored)?.[1];
	const slots =
		values === undefined
			? undefined
			: [...values.matchAll(/["']([^"']+)["']/gu)].map((match) => match[1]!).filter(Boolean);
	const ruleSlots = [
		...new Set(program.rules.filter((rule) => rule.name !== undefined).map((rule) => rule.name!)),
	];
	const captured = slots === undefined || slots.length === 0 ? ruleSlots : slots;
	if (captured.length === 0) return program;
	return {
		...program,
		compositions: program.compositions?.map((composition) =>
			composition.kind === StyleProgramCompositionKind.Slot
				? { ...composition, slots: captured }
				: composition,
		),
	};
}

/** Render a slot recipe in Panda's documented `sva` object shape. */
export function pandaSlotRecipeDefinitionObject(
	program: StyleProgram,
	declarationsObject: AdapterRenderers["declarationsObject"],
): string {
	const slots = new Map<string, StyleProgram["declarations"]>();
	const variants = new Map<string, Map<string, Map<string, StyleProgram["declarations"]>>>();
	for (const rule of program.rules) {
		if (rule.name === undefined) continue;
		const base = slots.get(rule.name) ?? [];
		const unconditional = rule.declarations.filter(
			(declaration) => declaration.conditions.length === 0,
		);
		if (unconditional.length > 0) slots.set(rule.name, [...base, ...unconditional]);
		for (const declaration of rule.declarations) {
			const [variant, value] = declaration.conditions;
			if (
				variant?.kind !== SemanticConditionKindTag.Named ||
				value?.kind !== SemanticConditionKindTag.Named
			)
				continue;
			const values = variants.get(variant.name) ?? new Map();
			const slotValues = values.get(value.name) ?? new Map();
			const declarations = slotValues.get(rule.name) ?? [];
			slotValues.set(rule.name, [...declarations, { ...declaration, conditions: [] }]);
			values.set(value.name, slotValues);
			variants.set(variant.name, values);
		}
	}
	const slotNames = program.compositions?.find(
		(composition) => composition.kind === StyleProgramCompositionKind.Slot,
	)?.slots ?? [...slots.keys()];
	const slotsText = slotNames.map((name) => JSON.stringify(name)).join(", ");
	const baseText = slotNames
		.map((name) => `${JSON.stringify(name)}: ${declarationsObject(slots.get(name) ?? [])}`)
		.join(", ");
	const variantsText = [...variants]
		.map(
			([name, values]) =>
				`${JSON.stringify(name)}: { ${[...values]
					.map(
						([value, slotValues]) =>
							`${JSON.stringify(value)}: { ${[...slotValues]
								.map(
									([slot, declarations]) =>
										`${JSON.stringify(slot)}: ${declarationsObject(declarations)}`,
								)
								.join(", ")} }`,
					)
					.join(", ")} }`,
		)
		.join(", ");
	return `{ slots: [${slotsText}], base: { ${baseText} }, variants: { ${variantsText} } }`;
}

/** Keep recipe extensions lossless until their target-specific shape is modeled. */
export function preserveUnsupportedRecipeFields(program: StyleProgram): StyleProgram {
	const unsupported = program.declarations.filter((declaration) =>
		unsupportedRecipeKeys.has(declaration.property),
	);
	if (unsupported.length === 0) return program;
	return {
		...program,
		residuals: [
			...program.residuals,
			...unsupported.map((declaration) => ({
				kind: StyleProgramResidualKindTag.Composition,
				text: declaration.property,
				hint: `recipe field "${declaration.property}" requires target-aware recipe lowering`,
			})),
		],
	};
}

/** Preserve slot-recipe metadata until its target shape has an exact carrier. */
export function preserveUnsupportedSlotRecipeFields(program: StyleProgram): StyleProgram {
	const unsupported = new Set(["className", "compoundVariants", "defaultVariants"]);
	const declarations = program.declarations.filter((declaration) =>
		unsupported.has(declaration.property),
	);
	const namedRules = program.rules.filter(
		(rule) => rule.name !== undefined && unsupported.has(rule.name),
	);
	if (declarations.length === 0 && namedRules.length === 0) return program;
	return {
		...program,
		residuals: [
			...program.residuals,
			...declarations.map((declaration) => ({
				kind: StyleProgramResidualKindTag.Composition,
				text: declaration.property,
				hint: `slot recipe field "${declaration.property}" requires target-aware lowering`,
			})),
			...namedRules.map((rule) => ({
				kind: StyleProgramResidualKindTag.Composition,
				text: rule.name!,
				hint: `slot recipe field "${rule.name}" requires target-aware lowering`,
			})),
		],
	};
}
