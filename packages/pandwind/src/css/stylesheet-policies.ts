import {
	createConditionsBucket,
	decodeAtomicPath,
	genCSSRule,
	parseCondition,
	type DecodedAtomicPath,
	type ParsedConditions,
} from "./stylesheet-lowering.ts";
import type { AnyConditions } from "../types/typings.ts";

/** Replaceable condition parser used while lowering flattened style paths. */
export interface ConditionPolicy {
	create(): ParsedConditions;
	parse(selector: string, conditions: ParsedConditions): true | undefined;
}

/** Replaceable CSS rule serializer for alternate dialects and diagnostics. */
export interface RuleSerializerPolicy {
	serialize(declarations: string, conditions: ParsedConditions): string;
}

/** Replaceable atomic-path decoder for alternate condition/property dialects. */
export interface AtomicPathDecoderPolicy {
	decode(conditions: AnyConditions, path: string): DecodedAtomicPath;
}

/** Replaceable cascade ordering policy for generated stylesheet entries. */
export interface StylesheetOrderingPolicy {
	order<T extends { priority: number }>(values: Iterable<T>): Array<T>;
}

class PriorityStylesheetOrderingPolicy implements StylesheetOrderingPolicy {
	order<T extends { priority: number }>(values: Iterable<T>): Array<T> {
		return Array.from(values).toSorted((a, b) => {
			const priority = a.priority - b.priority;
			if (priority !== 0) return priority;
			return responsiveCascadeOrder(a as { css?: string }, b as { css?: string });
		});
	}
}

/**
 * Keep progressively narrower min-width conditions in cascade order. The
 * numeric priority catalog intentionally treats all media rules as one family;
 * this tie-breaker prevents a 768px rule from overwriting a 1024px override
 * merely because files happened to be scanned in a different order.
 */
const responsiveCascadeOrder = (a: { css?: string }, b: { css?: string }): number => {
	const left = condition(a.css);
	const right = condition(b.css);
	if (left === undefined || right === undefined || left.direction !== right.direction) return 0;
	return left.direction === "min" ? left.width - right.width : right.width - left.width;
};

function condition(
	value: string | undefined,
): { direction: "min" | "max"; width: number } | undefined {
	const match = value?.match(/@(media|container)[^{]*\((min|max)-width:\s*([\d.]+)px/);
	if (match === null || match === undefined) return undefined;
	return { direction: match[2] as "min" | "max", width: Number(match[3]) };
}

export const createStylesheetOrderingPolicy = (): StylesheetOrderingPolicy =>
	new PriorityStylesheetOrderingPolicy();

export const defaultConditionPolicy: ConditionPolicy = {
	create: createConditionsBucket,
	parse: parseCondition,
};

export const defaultRuleSerializer: RuleSerializerPolicy = {
	serialize: genCSSRule,
};

export const defaultAtomicPathDecoder: AtomicPathDecoderPolicy = {
	decode: decodeAtomicPath,
};
