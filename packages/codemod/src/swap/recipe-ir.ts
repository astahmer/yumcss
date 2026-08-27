import type { StyleProgram, StyleProgramSource } from "./semantic-ir.ts";

export const STYLE_RECIPE_SCHEMA = "pandwind.style-recipe/1" as const;

export interface StyleRecipeVariant {
	readonly name: string;
	readonly values: Readonly<Record<string, StyleProgram>>;
}

export interface StyleRecipeCompoundVariant {
	readonly conditions: Readonly<Record<string, string>>;
	readonly program: StyleProgram;
}

export interface StyleRecipeProgram {
	readonly schema: typeof STYLE_RECIPE_SCHEMA;
	readonly name?: string;
	readonly base?: StyleProgram;
	readonly slots: Readonly<Record<string, StyleProgram>>;
	readonly variants: readonly StyleRecipeVariant[];
	readonly defaultVariants: Readonly<Record<string, string>>;
	readonly compoundVariants: readonly StyleRecipeCompoundVariant[];
	readonly source?: StyleProgramSource;
}

export type StyleRecipeSelection = Readonly<Record<string, string | undefined>>;

export interface ResolvedStyleRecipe {
	readonly base?: StyleProgram;
	readonly slots: Readonly<Record<string, StyleProgram>>;
	readonly selection: Readonly<Record<string, string>>;
}

function mergePrograms(programs: readonly StyleProgram[]): StyleProgram | undefined {
	const present = programs.filter((program): program is StyleProgram => program !== undefined);
	if (present.length === 0) return undefined;
	const first = present[0]!;
	return {
		schema: first.schema,
		rules: present.flatMap((program) => program.rules),
		declarations: present.flatMap((program) => program.declarations),
		residuals: present.flatMap((program) => program.residuals),
		source: first.source,
	};
}

/** Resolve defaults, variants, and compound variants without emitting CSS. */
export function resolveStyleRecipe(
	recipe: StyleRecipeProgram,
	selection: StyleRecipeSelection = {},
): ResolvedStyleRecipe {
	const resolvedSelection: Record<string, string> = { ...recipe.defaultVariants };
	for (const variant of recipe.variants) {
		const selected = selection[variant.name];
		if (selected !== undefined) resolvedSelection[variant.name] = selected;
	}
	const basePrograms: StyleProgram[] = recipe.base === undefined ? [] : [recipe.base];
	const slotPrograms = new Map<string, StyleProgram[]>();
	for (const slot of Object.keys(recipe.slots)) slotPrograms.set(slot, [recipe.slots[slot]!]);
	for (const variant of recipe.variants) {
		const selected = resolvedSelection[variant.name];
		const program = selected === undefined ? undefined : variant.values[selected];
		if (program === undefined) continue;
		basePrograms.push(program);
	}
	for (const compound of recipe.compoundVariants) {
		const matches = Object.entries(compound.conditions).every(
			([key, value]) => resolvedSelection[key] === value,
		);
		if (matches) basePrograms.push(compound.program);
	}
	return {
		base: mergePrograms(basePrograms),
		slots: Object.fromEntries(
			[...slotPrograms].map(([slot, programs]) => [slot, mergePrograms(programs)!]),
		),
		selection: resolvedSelection,
	};
}
