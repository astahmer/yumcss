import type { OxcNode } from "../tw/literal.ts";

export type StyleLiteralScope = Map<string, unknown>;

const identifier = (node: OxcNode | null | undefined): string | undefined =>
	node?.type === "Identifier" ? (node as { name?: string }).name : undefined;

const propertyName = (
	node: OxcNode | null | undefined,
	scope: ReadonlyMap<string, unknown>,
): string | undefined => {
	if (node?.type === "Identifier" && (node as { computed?: boolean }).computed !== true)
		return identifier(node);
	if (node?.type === "Literal") {
		const value = (node as { value?: unknown }).value;
		return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
	}
	const computed = evaluateStyleLiteral(node, scope);
	return typeof computed === "string" || typeof computed === "number" ? String(computed) : undefined;
};

/** Conservative evaluator for style constants and token objects. */
export function evaluateStyleLiteral(
	node: OxcNode | null | undefined,
	scope: ReadonlyMap<string, unknown> = new Map(),
): unknown {
	if (node === null || node === undefined) return undefined;
	switch (node.type) {
		case "ParenthesizedExpression":
			return evaluateStyleLiteral((node as { expression?: OxcNode }).expression, scope);
		case "TSAsExpression":
		case "TSTypeAssertion":
			return evaluateStyleLiteral(
				(node as { expression?: OxcNode; typeAnnotation?: OxcNode }).expression,
				scope,
			);
		case "Literal":
			return (node as { value?: unknown }).value;
		case "Identifier":
			return scope.get(identifier(node) ?? "");
		case "TemplateLiteral": {
			const quasis = (node as { quasis?: Array<{ value?: { cooked?: string; raw?: string } }> }).quasis ?? [];
			const expressions = (node as { expressions?: OxcNode[] }).expressions ?? [];
			let output = quasis[0]?.value?.cooked ?? quasis[0]?.value?.raw ?? "";
			for (let index = 0; index < expressions.length; index++) {
				const value = evaluateStyleLiteral(expressions[index], scope);
				if (typeof value !== "string" && typeof value !== "number") return undefined;
				output += String(value);
				output += quasis[index + 1]?.value?.cooked ?? quasis[index + 1]?.value?.raw ?? "";
			}
			return output;
		}
		case "BinaryExpression": {
			if ((node as { operator?: string }).operator !== "+") return undefined;
			const left = evaluateStyleLiteral((node as { left?: OxcNode }).left, scope);
			const right = evaluateStyleLiteral((node as { right?: OxcNode }).right, scope);
			if (typeof left === "string" && typeof right === "string") return left + right;
			if (typeof left === "number" && typeof right === "number") return left + right;
			return undefined;
		}
		case "UnaryExpression": {
			if ((node as { operator?: string }).operator !== "-") return undefined;
			const value = evaluateStyleLiteral((node as { argument?: OxcNode }).argument, scope);
			return typeof value === "number" ? -value : undefined;
		}
		case "ArrayExpression": {
			const values: unknown[] = [];
			for (const element of (node as { elements?: Array<OxcNode | null> }).elements ?? []) {
				if (element === null || element.type === "SpreadElement") return undefined;
				const value = evaluateStyleLiteral(element, scope);
				if (value === undefined) return undefined;
				values.push(value);
			}
			return values;
		}
		case "ObjectExpression": {
			const output: Record<string, unknown> = {};
			for (const property of (node as { properties?: OxcNode[] }).properties ?? []) {
				if (property.type !== "Property" || (property as { kind?: string }).kind !== "init") return undefined;
				const key = propertyName((property as { key?: OxcNode }).key, scope);
				const value = evaluateStyleLiteral((property as { value?: OxcNode }).value, scope);
				if (key === undefined || value === undefined) return undefined;
				output[key] = value;
			}
			return output;
		}
		case "MemberExpression": {
			const object = evaluateStyleLiteral((node as { object?: OxcNode }).object, scope);
			const key = propertyName((node as { property?: OxcNode }).property, scope);
			return object !== null && object !== undefined && key !== undefined &&
				typeof object === "object" ? (object as Record<string, unknown>)[key] : undefined;
		}
		case "CallExpression": {
			const callee = (node as { callee?: OxcNode }).callee;
			const member = callee?.type === "MemberExpression"
				? identifier((callee as { property?: OxcNode }).property)
				: undefined;
			if (member === "join" && callee?.type === "MemberExpression") {
				const object = evaluateStyleLiteral(
					(callee as { object?: OxcNode }).object,
					scope,
				);
				const separator = evaluateStyleLiteral(
					(node as { arguments?: OxcNode[] }).arguments?.[0],
					scope,
				);
				if (
					Array.isArray(object) &&
					(separator === undefined || typeof separator === "string") &&
					object.every((value) => typeof value === "string" || typeof value === "number")
				)
					return object.join(separator as string | undefined);
				return undefined;
			}
			if (member !== "defineConsts" && member !== "defineVars") return undefined;
			const value = evaluateStyleLiteral(
				(node as { arguments?: OxcNode[] }).arguments?.[0],
				scope,
			);
			if (member === "defineConsts" || typeof value !== "object" || value === null || Array.isArray(value))
				return value;
			// StyleX defineVars returns references to the named custom properties at
			// runtime, not the defaults used to define them. Preserve that runtime
			// contract while propagating imported token maps into static extraction.
			return Object.fromEntries(
				Object.keys(value).map((key) => [key, `var(${key})`]),
			);
		}
		default:
			return undefined;
	}
}

/** Collects safe top-level const values, including StyleX token/const calls. */
export function collectStyleConstants(
	program: OxcNode,
	imported: ReadonlyMap<string, unknown> = new Map(),
): StyleLiteralScope {
	const scope: StyleLiteralScope = new Map(imported);
	for (const statement of (program as { body?: OxcNode[] }).body ?? []) {
		const declaration = statement.type === "ExportNamedDeclaration"
			? (statement as { declaration?: OxcNode | null }).declaration
			: statement;
		if (declaration?.type !== "VariableDeclaration" || (declaration as { kind?: string }).kind !== "const") continue;
		for (const item of (declaration as { declarations?: OxcNode[] }).declarations ?? []) {
			const name = identifier((item as { id?: OxcNode }).id);
			const value = evaluateStyleLiteral((item as { init?: OxcNode }).init, scope);
			if (name !== undefined && value !== undefined) scope.set(name, value);
		}
	}
	return scope;
}
