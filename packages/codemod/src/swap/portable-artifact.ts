import { StyleProgramResidualKindTag, StyleValueKindTag } from "./semantic-ir.ts";
import type { StyleProgram, StyleProgramResidual, StyleValue } from "./semantic-ir.ts";
import { StyleProgramAnalysis } from "./style-program-analysis.ts";

/**
 * Portable runtime carrier shared by targets that cannot express a dynamic
 * value in their own API. It is deliberately narrow: only residuals produced
 * by Pandwind's dynamic lowering are consumed, and every other residual stays
 * visible to validation.
 */
export class PortableStyleArtifact {
	static readonly preservedResidualKinds = [
		"dynamic",
		"dynamic-custom-property",
		"dynamic-fallback",
		"function-dynamic",
	] as const;

	static restoreDynamicValues(
		program: StyleProgram,
		residuals: readonly StyleProgramResidual[],
	): StyleProgram {
		const expressions = new Map<string, string>();
		for (const residual of residuals) {
			if (residual.kind !== StyleProgramResidualKindTag.DynamicCustomProperty) continue;
			expressions.set(this.dynamicVariableName(residual.text), residual.text);
		}

		const restoreValue = (value: StyleValue): StyleValue => {
			if (
				value.kind !== StyleValueKindTag.Literal ||
				typeof value.value !== "string" ||
				!value.value.startsWith("var(--pandwind-dynamic-")
			)
				return value;
			const expression = expressions.get(value.value.slice(4, -1));
			return expression === undefined
				? value
				: { kind: "dynamic", expression, lowering: "runtime" };
		};
		const declarations = (items: readonly StyleProgram["declarations"][number][]) =>
			items.map((declaration) => ({ ...declaration, value: restoreValue(declaration.value) }));
		const restoreRule = (rule: StyleProgram["rules"][number]): StyleProgram["rules"][number] => ({
			...rule,
			declarations: declarations(rule.declarations),
			children: rule.children.map(restoreRule),
		});
		return {
			...program,
			declarations: declarations(program.declarations),
			rules: program.rules.map(restoreRule),
		};
	}

	static containsDynamicValues(program: StyleProgram): boolean {
		return StyleProgramAnalysis.hasDynamic(program);
	}

	static objectText(program: StyleProgram): string {
		const valueText = (value: StyleValue): string => {
			if (value.kind === StyleValueKindTag.Dynamic) return value.expression;
			if (value.kind === StyleValueKindTag.Token) return JSON.stringify(value.authored);
			return JSON.stringify(value.value);
		};
		type ObjectNode = { values: Array<[string, string]>; children: Map<string, ObjectNode> };
		const render = (node: ObjectNode): string => {
			const values = node.values.map(([key, value]) => `${JSON.stringify(key)}: ${value}`);
			const children = [...node.children].map(
				([key, child]) => `${JSON.stringify(key)}: ${render(child)}`,
			);
			return `{ ${[...values, ...children].join(", ")} }`;
		};
		const root: ObjectNode = { values: [], children: new Map() };
		const add = (
			node: ObjectNode,
			declaration: StyleProgram["declarations"][number],
			index: number,
		): void => {
			const condition = declaration.conditions[index];
			if (condition === undefined) {
				node.values.push([declaration.property, valueText(declaration.value)]);
				return;
			}
			const key = condition.raw ?? condition.value ?? condition.name;
			const child = node.children.get(key) ?? { values: [], children: new Map() };
			node.children.set(key, child);
			add(child, declaration, index + 1);
		};
		const addRule = (node: ObjectNode, rule: StyleProgram["rules"][number]): void => {
			for (const declaration of rule.declarations) add(node, declaration, 0);
			for (const child of rule.children) {
				const key = child.name ?? child.selector ?? child.kind;
				const nested = node.children.get(key) ?? { values: [], children: new Map() };
				node.children.set(key, nested);
				addRule(nested, child);
			}
		};
		for (const rule of program.rules) addRule(root, rule);
		return render(root);
	}

	private static dynamicVariableName(expression: string): string {
		let hash = 2166136261;
		for (const character of expression) {
			hash ^= character.charCodeAt(0);
			hash = Math.imul(hash, 16777619);
		}
		return `--pandwind-dynamic-${(hash >>> 0).toString(36)}`;
	}
}
