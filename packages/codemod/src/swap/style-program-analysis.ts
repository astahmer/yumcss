import { StyleValueKindTag } from "./semantic-ir.ts";
import { type StyleDeclaration, type StyleProgram, type StyleRule } from "./semantic-ir.ts";
import { StyleDynamicExpressionKind } from "./identifiers.ts";

/** Read-only semantic queries shared by lowering and adapter projections. */
export class StyleProgramAnalysis {
	static rules(program: StyleProgram): readonly StyleRule[] {
		const result: StyleRule[] = [];
		const stack = [...program.rules].toReversed();
		while (stack.length > 0) {
			const rule = stack.pop()!;
			result.push(rule);
			for (const child of rule.children.toReversed()) stack.push(child);
		}
		return result;
	}

	static declarations(program: StyleProgram): readonly StyleDeclaration[] {
		if (program.rules.length === 0) return program.declarations;
		return StyleProgramAnalysis.rules(program).flatMap((rule) => {
			return rule.declarations;
		});
	}

	static hasDynamic(program: StyleProgram): boolean {
		if (program.rules.length === 0) {
			return StyleProgramAnalysis.declarations(program).some(
				({ value }) => value.kind === StyleValueKindTag.Dynamic,
			);
		}
		return StyleProgramAnalysis.rules(program).some((rule) => {
			return (
				(rule.selector?.includes("${") ?? false) ||
				rule.conditions.some(
					(condition) => condition.name.includes("${") || condition.value?.includes("${"),
				) ||
				rule.declarations.some(({ value }) => value.kind === StyleValueKindTag.Dynamic)
			);
		});
	}

	static hasFunctionDynamic(program: StyleProgram): boolean {
		return StyleProgramAnalysis.declarations(program).some(
			({ value }) => value.kind === StyleValueKindTag.Dynamic && isFunctionDynamic(value),
		);
	}

	static hasScalarDynamic(program: StyleProgram): boolean {
		return StyleProgramAnalysis.declarations(program).some(
			({ value }) => value.kind === StyleValueKindTag.Dynamic && !isFunctionDynamic(value),
		);
	}
}

function isFunctionDynamic(value: {
	kind: `${StyleValueKindTag.Dynamic}`;
	expression: string;
	expressionKind?: StyleDynamicExpressionKind;
}): boolean {
	return (
		value.expressionKind === StyleDynamicExpressionKind.Function ||
		/=>|^function\b/.test(value.expression.trim())
	);
}
