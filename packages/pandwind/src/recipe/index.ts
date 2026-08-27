import type { CssFn } from "../css/index.ts";
import type { StyleObject } from "../types/typings.ts";

export type RecipeSelection = Readonly<Record<string, string | boolean | undefined>>;

export interface RecipeCompoundVariant {
	readonly when: Readonly<Record<string, string | boolean>>;
	readonly style: StyleObject;
}

export interface RecipeDefinition {
	readonly base?: StyleObject;
	readonly variants?: Readonly<Record<string, Readonly<Record<string, StyleObject>>>>;
	readonly defaultVariants?: RecipeSelection;
	readonly compoundVariants?: readonly RecipeCompoundVariant[];
}

export interface SlotRecipeDefinition extends RecipeDefinition {
	readonly slots: Readonly<Record<string, StyleObject>>;
	readonly slotVariants?: Readonly<
		Record<string, Readonly<Record<string, Readonly<Record<string, StyleObject>>>>>
	>;
}

export type RecipeFunction = (selection?: RecipeSelection) => string;

function matches(
	selection: RecipeSelection,
	conditions: Readonly<Record<string, string | boolean>>,
): boolean {
	return Object.entries(conditions).every(([key, value]) => selection[key] === value);
}

function selectedValues(
	definition: RecipeDefinition,
	selection: RecipeSelection,
): Record<string, string | boolean> {
	const values: Record<string, string | boolean> = {};
	for (const [name, variants] of Object.entries(definition.variants ?? {})) {
		const value = selection[name] ?? definition.defaultVariants?.[name];
		if (value !== undefined && variants[String(value)] !== undefined) values[name] = value;
	}
	return values;
}

/** Create a deterministic variant recipe on top of any existing css factory. */
export function createRecipe(
	css: Pick<CssFn<StyleObject>, "class">,
	definition: RecipeDefinition,
): RecipeFunction {
	return (selection: RecipeSelection = {}) => {
		const values = selectedValues(definition, selection);
		const styles: StyleObject[] = [];
		if (definition.base !== undefined) styles.push(definition.base);
		for (const [name, value] of Object.entries(values)) {
			const style = definition.variants?.[name]?.[String(value)];
			if (style !== undefined) styles.push(style);
		}
		for (const compound of definition.compoundVariants ?? []) {
			if (matches({ ...values, ...selection }, compound.when)) styles.push(compound.style);
		}
		const generated = css.class(...styles);
		const extra = selection.className;
		return extra === undefined || extra === "" ? generated : `${generated} ${extra}`;
	};
}

/** Create one recipe with independently addressable slot class names. */
export function createSlotRecipe(
	css: Pick<CssFn<StyleObject>, "class">,
	definition: SlotRecipeDefinition,
): (selection?: RecipeSelection) => Readonly<Record<string, string>> {
	return (selection: RecipeSelection = {}) => {
		const values = selectedValues(definition, selection);
		const output: Record<string, string> = {};
		for (const [slot, base] of Object.entries(definition.slots)) {
			const styles: StyleObject[] = [base];
			for (const [name, value] of Object.entries(values)) {
				const style = definition.slotVariants?.[name]?.[String(value)]?.[slot];
				if (style !== undefined) styles.push(style);
			}
			output[slot] = css.class(...styles);
		}
		return output;
	};
}
