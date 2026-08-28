import type {
	RuntimeDeclaration,
	RuntimeRuleSerializer,
	RuntimeSemanticRule,
} from "./runtime-sheet-contracts.ts";

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
	items.map((item) => `${item.property}:${declarationValue(item.value)}`).join(";");

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
			case "style":
			case "global": {
				const resolved = selector(
					rule.selector ?? (rule.kind === "global" ? "*" : "&"),
					rule.conditions ?? [],
				);
				output = `${resolved.selector}{${body}}`;
				output = resolved.wrappers.reduceRight(
					(current, wrapper) => `${wrapper}{${current}}`,
					output,
				);
				return output;
			}
			case "keyframes":
				output = `@keyframes ${rule.name ?? ""}{${body}}`;
				break;
			case "font-face":
				output = `@font-face{${body}}`;
				break;
			case "layer":
				output = `@layer ${rule.layer ?? rule.name ?? ""}{${body}}`;
				break;
			case "supports":
				output = `@supports ${rule.name ?? ""}{${body}}`;
				break;
			case "property":
				output = `@property ${rule.name ?? ""}{${body}}`;
				break;
		}
		return (rule.conditions ?? []).reduceRight(
			(current, item) => `${condition(item)}{${current}}`,
			output,
		);
	}
}

export class SemanticRuleCanonicalizer {
	constructor(private readonly serializer: RuntimeRuleSerializer = new SemanticRuleSerializer()) {}

	canonicalize(rule: RuntimeSemanticRule) {
		const { priority: _priority, ...identity } = rule;
		return {
			id: rule.id ?? `semantic-${hash(JSON.stringify(identity))}`,
			css: this.serializer.serialize(rule),
			priority: rule.priority ?? 0,
		};
	}
}
