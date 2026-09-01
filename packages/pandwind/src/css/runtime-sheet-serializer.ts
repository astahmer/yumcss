import { RuntimeSemanticRuleKindTag } from "./runtime-sheet-contracts.ts";
import type {
	RuntimeDeclaration,
	RuntimeRuleSerializer,
	RuntimeSemanticRule,
} from "./runtime-sheet-contracts.ts";
import { dashCase } from "./hash.ts";

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
const declarations = (items: readonly RuntimeDeclaration[] = []): string =>
	items.map((item) => `${dashCase(item.property)}:${declarationValue(item.value)}`).join(";");

const condition = (value: string): string =>
	/^@(media|container|supports)\b/.test(value) || value.startsWith(":") || value.startsWith("&")
		? value
		: `&:${value}`;

const selector = (
	value: string,
	conditions: readonly string[],
): { selector: string; wrappers: string[] } => {
	let result = value;
	const wrappers: string[] = [];
	for (const item of conditions) {
		// Preserve authored condition order for nested wrappers; selector
		// conditions compose onto the selector in the same order instead.
		if (/^@(media|container|supports)\b/.test(item)) wrappers.push(item);
		else if (item.startsWith("&")) result = item.replaceAll("&", result);
		else result += item.startsWith(":") ? item : `:${item}`;
	}
	return { selector: result, wrappers };
};

export class SemanticRuleSerializer implements RuntimeRuleSerializer {
	serialize(rule: RuntimeSemanticRule): string {
		const body =
			declarations(rule.declarations) +
			(rule.children ?? []).map((child) => this.serialize(child)).join("");
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
		// Priority affects ordering, not identity. Excluding it keeps a rule's
		// deduplication key stable when an ordering policy changes.
		const { priority: _priority, ...identity } = rule;
		return {
			id: rule.id ?? `semantic-${hash(JSON.stringify(identity))}`,
			css: this.serializer.serialize(rule),
			priority: rule.priority ?? 0,
		};
	}
}
