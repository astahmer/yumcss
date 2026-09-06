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
