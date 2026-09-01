import { type StyleDeclaration, type StyleProgram, type StyleRule } from "./semantic-ir.ts";
import { StyleDynamicExpressionKind } from "./identifiers.ts";

/** Read-only semantic queries shared by lowering and adapter projections. */
export class StyleProgramAnalysis {
	static declarations(program: StyleProgram): readonly StyleDeclaration[] {
		return program.rules.flatMap(function collect(rule): StyleDeclaration[] {
			return [...rule.declarations, ...rule.children.flatMap(collect)];
		});
	}

	static hasDynamic(program: StyleProgram): boolean {
		return program.rules.some(function containsDynamic(rule: StyleRule): boolean {
			return (
				(rule.selector?.includes("${") ?? false) ||
				rule.conditions.some(
					(condition) => condition.name.includes("${") || condition.value?.includes("${"),
				) ||
				rule.declarations.some(({ value }) => value.kind === "dynamic") ||
				rule.children.some(containsDynamic)
			);
		});
	}

	static hasFunctionDynamic(program: StyleProgram): boolean {
		return StyleProgramAnalysis.declarations(program).some(
			({ value }) =>
				value.kind === "dynamic" &&
				(value.expressionKind === StyleDynamicExpressionKind.Function ||
					/=>|^function\b/.test(value.expression.trim())),
		);
	}
}
