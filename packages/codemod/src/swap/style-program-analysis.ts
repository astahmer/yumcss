import { SOURCE_SCANNER_SERVICE } from "pandwind/source";
import { NodeKind, evalLiteralValues } from "pandwind/tw/literal";
import { StyleValueKindTag } from "./semantic-ir.ts";
import {
	type StyleDeclaration,
	type StyleDynamicValue,
	type StyleProgram,
	type StyleRule,
} from "./semantic-ir.ts";
import { StyleDynamicExpressionKind } from "./identifiers.ts";

const finiteStaticStyleExpression = (value: StyleDynamicValue): boolean => {
	try {
		const parsed = SOURCE_SCANNER_SERVICE.parse({
			file: "pandwind-dynamic-style-expression.tsx",
			source: `const __pandwindValue = (${value.expression});`,
			language: "tsx",
		});
		if (parsed.errors.length > 0) return false;
		const declaration = parsed.program.body.find(
			(statement) => statement.type === NodeKind.VariableDeclaration,
		);
		const initializer = declaration?.declarations[0]?.init;
		if (initializer === undefined || initializer === null) return false;
		const expression =
			initializer.type === NodeKind.ParenthesizedExpression ? initializer.expression : initializer;
		const values = evalLiteralValues(expression);
		return (
			values !== undefined &&
			values.values.length > 0 &&
			values.values.every(isFiniteStaticStyleValue)
		);
	} catch {
		return false;
	}
};

const isFiniteStaticStyleValue = (value: unknown): boolean => {
	if (typeof value === "string" || typeof value === "number") return true;
	if (Array.isArray(value)) return value.every(isFiniteStaticStyleValue);
	if (value === null || typeof value !== "object") return false;
	return Object.values(value).every(isFiniteStaticStyleValue);
};

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

	static isFiniteStaticExpression(value: StyleDynamicValue): boolean {
		return finiteStaticStyleExpression(value);
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

	/** True when a dynamic value still needs a runtime variable carrier. */
	static hasRuntimeDynamic(program: StyleProgram): boolean {
		if (program.rules.length === 0) {
			return StyleProgramAnalysis.declarations(program).some(
				({ value }) =>
					value.kind === StyleValueKindTag.Dynamic && !finiteStaticStyleExpression(value),
			);
		}
		return StyleProgramAnalysis.rules(program).some((rule) => {
			return (
				(rule.selector?.includes("${") ?? false) ||
				rule.conditions.some(
					(condition) => condition.name.includes("${") || condition.value?.includes("${"),
				) ||
				rule.declarations.some(
					({ value }) =>
						value.kind === StyleValueKindTag.Dynamic && !finiteStaticStyleExpression(value),
				)
			);
		});
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
