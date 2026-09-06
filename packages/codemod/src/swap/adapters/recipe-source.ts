import { StyleProgramCompositionKind } from "../identifiers.ts";
import {
	StyleProgramResidualKindTag,
	type StyleProgram,
} from "../semantic-ir.ts";
import type { AdapterSourceObjectOptions } from "../external-adapters.ts";

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

/** Parse Panda slot recipes as named slot rules plus named variant conditions. */
export const slotRecipeSourceObjectOptions = (): AdapterSourceObjectOptions => ({
	namedRuleObjects: true,
	variantContainerKeys: ["variants"],
	ignoredObjectKeys: ["slots"],
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
	if (slots === undefined || slots.length === 0) return program;
	return {
		...program,
		compositions: program.compositions?.map((composition) =>
			composition.kind === StyleProgramCompositionKind.Slot ? { ...composition, slots } : composition,
		),
	};
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
