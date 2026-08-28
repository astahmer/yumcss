import type { ParsedConditions } from "./css-rule-serializer.ts";

/** Replaceable condition parser used while lowering flattened style paths. */
export interface ConditionPolicy {
	create(): ParsedConditions;
	parse(selector: string, conditions: ParsedConditions): true | undefined;
}

/** Replaceable cascade ordering policy for generated stylesheet entries. */
export interface StylesheetOrderingPolicy {
	order<T extends { priority: number }>(values: Iterable<T>): Array<T>;
}

class PriorityStylesheetOrderingPolicy implements StylesheetOrderingPolicy {
	order<T extends { priority: number }>(values: Iterable<T>): Array<T> {
		return Array.from(values).toSorted((a, b) => a.priority - b.priority);
	}
}

export const createStylesheetOrderingPolicy = (): StylesheetOrderingPolicy =>
	new PriorityStylesheetOrderingPolicy();
