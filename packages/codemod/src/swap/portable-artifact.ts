import type { StyleProgram, StyleProgramResidual, StyleValue } from "./semantic-ir.ts";

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
			if (residual.kind !== "dynamic-custom-property") continue;
			expressions.set(this.dynamicVariableName(residual.text), residual.text);
		}

		const restoreValue = (value: StyleValue): StyleValue => {
			if (
				value.kind !== "literal" ||
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
		return program.rules.some(function containsDynamic(rule): boolean {
			return (
				rule.declarations.some((declaration) => declaration.value.kind === "dynamic") ||
				rule.children.some(containsDynamic)
			);
		});
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
