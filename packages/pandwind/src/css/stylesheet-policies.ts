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
		return Array.from(values).toSorted((a, b) => a.priority - b.priority);
	}
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
