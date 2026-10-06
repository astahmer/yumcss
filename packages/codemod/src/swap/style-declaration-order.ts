import { getPropertyPriority } from "yumcss/css/create-stylesheet";
import type { StyleDeclaration } from "./semantic-ir.ts";

/** Replaceable declaration-order policy for canonical semantic emission. */
export interface StyleDeclarationOrderingPolicy {
	order(declarations: readonly StyleDeclaration[]): StyleDeclaration[];
}

class CssCascadeDeclarationOrderingPolicy implements StyleDeclarationOrderingPolicy {
	order(declarations: readonly StyleDeclaration[]): StyleDeclaration[] {
		return declarations.toSorted((left, right) => {
			// CSS shorthand groups have explicit precedence independent of
			// authored object insertion order. Same-property declarations remain
			// stable because their authored order is the cascade signal.
			if (left.property !== right.property) {
				const priority = getPropertyPriority(left.property) - getPropertyPriority(right.property);
				if (priority !== 0) return priority;
				return compareCodeUnits(left.property, right.property);
			}
			return compareCodeUnits(conditionKey(left), conditionKey(right));
		});
	}
}

const conditionKey = (declaration: StyleDeclaration): string =>
	declaration.conditions
		.map((condition) => `${condition.kind}:${condition.name}:${condition.value ?? ""}`)
		.join("|");

const compareCodeUnits = (left: string, right: string): number =>
	left < right ? -1 : left > right ? 1 : 0;

export const createStyleDeclarationOrderingPolicy = (): StyleDeclarationOrderingPolicy =>
	new CssCascadeDeclarationOrderingPolicy();
