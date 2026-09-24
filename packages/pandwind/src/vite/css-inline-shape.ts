import { NodeKind } from "../ast-node-kind.ts";
import type { OxcNode } from "../tw/literal.ts";

type ObjectNode = OxcNode & { properties?: readonly OxcNode[] };
type PropertyNode = OxcNode & {
	key?: OxcNode;
	value?: OxcNode;
	argument?: OxcNode;
};
type KeyNode = OxcNode & { name?: string; value?: unknown };

const propertyName = (property: PropertyNode): string | undefined => {
	const key = property.key as KeyNode | undefined;
	if (key?.type === NodeKind.Identifier) return key.name;
	if (key?.type === NodeKind.Literal && typeof key.value === "string") return key.value;
	return undefined;
};

export const hasDuplicateCssObjectKeys = (node: OxcNode): boolean => {
	if (node.type !== NodeKind.ObjectExpression) return false;
	const keys = new Set<string>();
	for (const property of (node as ObjectNode).properties ?? []) {
		if (property.type === NodeKind.Property) {
			const name = propertyName(property as PropertyNode);
			if (name !== undefined) {
				if (keys.has(name)) return true;
				keys.add(name);
			}
			const value = (property as PropertyNode).value;
			if (value !== undefined && hasDuplicateCssObjectKeys(value)) return true;
			continue;
		}
		if (property.type === NodeKind.SpreadElement) {
			const argument = (property as PropertyNode).argument;
			if (argument !== undefined && hasDuplicateCssObjectKeys(argument)) return true;
		}
	}
	return false;
};
