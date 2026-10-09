import { RuntimeSemanticRuleKindTag } from "./runtime-sheet-contracts.ts";
import type {
	RuntimeDeclaration,
	RuntimeRuleSerializer,
	RuntimeSemanticRule,
} from "./runtime-sheet-contracts.ts";
import { dashCase } from "./hash.ts";
import { serializeCssPropertySyntax } from "./css-variables.ts";
import {
	hasRelativeSelectorPrefix,
	hasParentSelectorReference,
	replaceParentSelector,
	splitSelectorList,
} from "./selector-list.ts";

const hash = (input: string): string => {
	let value = 2166136261;
	for (let index = 0; index < input.length; index++) {
		value ^= input.charCodeAt(index);
		value = Math.imul(value, 16777619);
	}
	return (value >>> 0).toString(36);
};

const declarationValue = (value: RuntimeDeclaration["value"]): string =>
	typeof value === "string" ? value : String(value);
const declarations = (items: readonly RuntimeDeclaration[] = [], propertyRule = false): string =>
	items
		.map((item) => {
			const value =
				propertyRule && item.property === "syntax" && typeof item.value === "string"
					? serializeCssPropertySyntax(item.value)
					: declarationValue(item.value);
			return `${dashCase(item.property)}:${value}`;
		})
		.join(";");

const condition = (value: string): string =>
	value.startsWith("@") || value.startsWith(":") || value.startsWith("&") ? value : `&:${value}`;

const applySelectorCondition = (base: string, conditionValue: string): string => {
	const items = splitSelectorList(conditionValue);
	return splitSelectorList(base)
		.flatMap((baseSelector) =>
			items.map((item) => {
				if (items.length > 1 || hasParentSelectorReference(item) || hasRelativeSelectorPrefix(item))
					return replaceParentSelector(item, baseSelector);
				return `${baseSelector}:${item}`;
			}),
		)
		.join(", ");
};

const selector = (
	value: string,
	conditions: readonly string[],
): { selector: string; wrappers: string[] } => {
	let result = value;
	const wrappers: string[] = [];
	for (const item of conditions) {
		// Preserve authored condition order for nested wrappers; selector
		// conditions compose onto the selector in the same order instead.
		if (item.startsWith("@")) wrappers.push(item);
		else result = applySelectorCondition(result, item);
	}
	return { selector: result, wrappers };
};

export class SemanticRuleSerializer implements RuntimeRuleSerializer {
	serialize(rule: RuntimeSemanticRule): string {
		type Frame = {
			readonly rule: RuntimeSemanticRule;
			readonly parts: string[];
			index: number;
		};
		const frames: Frame[] = [
			{
				rule,
				parts: [declarations(rule.declarations, rule.kind === RuntimeSemanticRuleKindTag.Property)],
				index: 0,
			},
		];
		const activeRules = new WeakSet<object>();
		activeRules.add(rule);
		let output = "";
		while (frames.length > 0) {
			const frame = frames.at(-1)!;
			const child = frame.rule.children?.[frame.index++];
			if (child !== undefined) {
				if (activeRules.has(child)) throw new Error("Cyclic runtime semantic rule tree");
				activeRules.add(child);
				frames.push({
					rule: child,
					parts: [
						declarations(child.declarations, child.kind === RuntimeSemanticRuleKindTag.Property),
					],
					index: 0,
				});
				continue;
			}
			frames.pop();
			activeRules.delete(frame.rule);
			const body = frame.parts.join("");
			const serialized = this.serializeRule(frame.rule, body);
			const parent = frames.at(-1);
			if (parent === undefined) output = serialized;
			else parent.parts.push(serialized);
		}
		return output;
	}

	private serializeRule(rule: RuntimeSemanticRule, body: string): string {
		let output: string;
		switch (rule.kind) {
			case RuntimeSemanticRuleKindTag.Style:
			case RuntimeSemanticRuleKindTag.Global: {
				const resolved = selector(
					rule.selector ?? (rule.kind === RuntimeSemanticRuleKindTag.Global ? "*" : "&"),
					rule.conditions ?? [],
				);
				output = `${resolved.selector}{${body}}`;
				output = resolved.wrappers.reduceRight(
					(current, wrapper) => `${wrapper}{${current}}`,
					output,
				);
				return output;
			}
			case RuntimeSemanticRuleKindTag.Keyframes:
				output = `@keyframes ${rule.name ?? ""}{${body}}`;
				break;
			case RuntimeSemanticRuleKindTag.FontFace:
				output = `@font-face{${body}}`;
				break;
			case RuntimeSemanticRuleKindTag.Layer:
				output = `@layer ${rule.layer ?? rule.name ?? ""}{${body}}`;
				break;
			case RuntimeSemanticRuleKindTag.Supports:
				output = `@supports ${rule.name ?? ""}{${body}}`;
				break;
			case RuntimeSemanticRuleKindTag.Property:
				output = `@property ${rule.name ?? ""}{${body}}`;
				break;
			default:
				throw new Error(`unknown runtime semantic rule kind: ${rule.kind}`);
		}
		return (rule.conditions ?? []).reduceRight(
			(current, item) => `${condition(item)}{${current}}`,
			output,
		);
	}
}

export class SemanticRuleCanonicalizer {
	private readonly serializer: RuntimeRuleSerializer;

	constructor(serializer: RuntimeRuleSerializer = new SemanticRuleSerializer()) {
		this.serializer = serializer;
	}

	canonicalize(rule: RuntimeSemanticRule) {
		// Priority affects ordering, not the emitted rule identity.
		const css = this.serializer.serialize(rule);
		return {
			id: rule.id ?? `semantic-${hash(css)}-${css}`,
			css,
			priority: rule.priority ?? 0,
		};
	}
}
