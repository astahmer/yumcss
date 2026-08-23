/**
 * oxc-based literal evaluation, shared by the scanner (`collect.ts`) and the
 * vite plugin. oxc parses TS/TSX several times faster than the TS compiler
 * API, and for static extraction we only need the AST — never type info.
 */
import type { Expression } from "oxc-parser";

export interface OxcNode {
	type: string;
	[key: string]: unknown;
}

/** Depth-first walk over an oxc AST node, visiting every typed child once. */
export function walk(node: unknown, visit: (node: OxcNode) => void): void {
	if (Array.isArray(node)) {
		for (const item of node) walk(item, visit);
		return;
	}
	if (node === null || typeof node !== "object") return;
	const current = node as OxcNode;
	if (typeof current.type === "string") visit(current);
	for (const value of Object.values(current)) walk(value, visit);
}

/**
 * Optional module-level constant scope for `evalLiteral`: name -> known
 * value. Only values proven constant by the caller (see the cx inliner's
 * `collectModuleConstants`) should be passed — evalLiteral trusts it.
 */
export type LiteralConstantScope = ReadonlyMap<string, unknown>;

/**
 * Statically evaluate a literal expression. Only pure literal values are
 * supported; anything else (variables, spreads, template interpolation)
 * returns `undefined`, making the enclosing call invisible to extraction —
 * the same limitation as dynamic class names in plain Tailwind.
 *
 * With `consts`, module-level constant bindings participate: Identifier
 * references resolve through the scope, and template interpolations / `+
 * concatenations of known strings fold accordingly. Unknown identifiers
 * still return `undefined`.
 */
export function evalLiteral(node: Expression | undefined, consts?: LiteralConstantScope): unknown {
	if (!node) return undefined;
	switch (node.type) {
		case "Literal":
			return node.value;
		case "Identifier": {
			const name = (node as unknown as { name?: string }).name;
			if (consts !== undefined && typeof name === "string") {
				const known = consts.get(name);
				if (known !== undefined) return known;
			}
			return undefined;
		}
		case "TemplateLiteral": {
			const hasExpressions = node.expressions.length !== 0;
			if (hasExpressions && consts === undefined) return undefined;
			if (node.quasis.length !== node.expressions.length + 1) return undefined;
			let out = node.quasis[0]?.value.cooked ?? node.quasis[0]?.value.raw ?? "";
			for (let i = 0; i < node.expressions.length; i++) {
				const value = evalLiteral(node.expressions[i], consts);
				if (typeof value !== "string") return undefined;
				out += value;
				out += node.quasis[i + 1]?.value.cooked ?? node.quasis[i + 1]?.value.raw ?? "";
			}
			return out;
		}
		case "BinaryExpression": {
			if (consts === undefined || node.operator !== "+") return undefined;
			const left = evalLiteral(node.left, consts);
			if (typeof left !== "string") return undefined;
			const right = evalLiteral(node.right, consts);
			if (typeof right !== "string") return undefined;
			return left + right;
		}
		case "UnaryExpression": {
			if (node.operator !== "-" || node.argument.type !== "Literal") {
				return undefined;
			}
			const value = node.argument.value;
			return typeof value === "number" ? -value : undefined;
		}
		case "ArrayExpression": {
			const values: unknown[] = [];
			for (const element of node.elements) {
				if (element === null || element.type === "SpreadElement") {
					return undefined;
				}
				const value = evalLiteral(element, consts);
				if (value === undefined) return undefined;
				values.push(value);
			}
			return values;
		}
		case "ObjectExpression": {
			const styles: Record<string, unknown> = {};
			for (const property of node.properties) {
				if (
					property.type !== "Property" ||
					property.kind !== "init" ||
					property.computed ||
					property.method ||
					property.shorthand
				) {
					return undefined;
				}
				const key = property.key;
				const name =
					key.type === "Identifier"
						? key.name
						: key.type === "Literal" && typeof key.value === "string"
							? key.value
							: undefined;
				if (name === undefined) return undefined;
				const value = evalLiteral(property.value, consts);
				if (value === undefined) return undefined;
				styles[name] = value;
			}
			return styles;
		}
		default:
			return undefined;
	}
}

/** True when `node` is a call to the bare identifier `tw`. */
export function isTwCall(node: OxcNode): node is OxcNode & {
	arguments: Expression[];
} {
	return (
		node.type === "CallExpression" &&
		node.callee !== null &&
		typeof node.callee === "object" &&
		(node.callee as OxcNode).type === "Identifier" &&
		(node.callee as { name?: string }).name === "tw"
	);
}
