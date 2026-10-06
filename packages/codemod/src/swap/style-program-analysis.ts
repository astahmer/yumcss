import { SOURCE_SCANNER_SERVICE } from "yumcss/source";
import { NodeKind, evalLiteralValues } from "yumcss/tw/literal";
import { StyleValueKindTag } from "./semantic-ir.ts";
import {
	type StyleDeclaration,
	type StyleDynamicValue,
	type StyleProgram,
	type StyleRule,
} from "./semantic-ir.ts";
import { StyleDynamicExpressionKind } from "./identifiers.ts";

const standardResponsiveConditionNames = new Set([
	"xs",
	"sm",
	"md",
	"lg",
	"xl",
	"2xl",
	"3xl",
	"4xl",
	"5xl",
]);

const isStaticStyleConditionName = (name: string): boolean =>
	name === "base" ||
	name === "default" ||
	standardResponsiveConditionNames.has(name) ||
	name.startsWith("_") ||
	name.startsWith(":") ||
	name.startsWith("&") ||
	name.startsWith("[") ||
	name.startsWith("@");

const isFiniteStaticScalar = (value: unknown): boolean =>
	typeof value === "string" || typeof value === "number";

const isFiniteStaticStyleLeaf = (value: unknown): boolean =>
	isFiniteStaticScalar(value) ||
	(Array.isArray(value) && value.length > 0 && value.every(isFiniteStaticStyleLeaf));

const isFiniteStaticStyleConditionObject = (value: unknown): boolean => {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
	const entries = Object.entries(value);
	return (
		entries.length > 0 &&
		entries.every(
			([name, nestedValue]) =>
				isStaticStyleConditionName(name) && isFiniteStaticStyleLeaf(nestedValue),
		)
	);
};

const finiteStaticStyleExpression = (value: StyleDynamicValue): boolean => {
	if (
		value.expressionKind !== StyleDynamicExpressionKind.Conditional &&
		value.expressionKind !== StyleDynamicExpressionKind.Object
	)
		return false;
	try {
		const parsed = SOURCE_SCANNER_SERVICE.parse({
			file: "yumcss-dynamic-style-expression.tsx",
			source: `const __yumcssValue = (${value.expression});`,
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
			(value.expressionKind === StyleDynamicExpressionKind.Object
				? values.values.every(isFiniteStaticStyleConditionObject)
				: values.values.every(isFiniteStaticScalar))
		);
	} catch {
		return false;
	}
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
