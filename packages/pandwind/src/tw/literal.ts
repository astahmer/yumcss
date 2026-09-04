import { NodeKind, PropertyKindTag } from "../ast-node-kind.ts";
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
	const stack: unknown[] = [node];
	while (stack.length > 0) {
		const current = stack.pop();
		if (Array.isArray(current)) {
			for (let index = current.length - 1; index >= 0; index--) stack.push(current[index]);
			continue;
		}
		if (current === null || typeof current !== "object") continue;
		const typed = current as OxcNode;
		if (typeof typed.type === "string") visit(typed);
		const values = Object.values(typed);
		for (let index = values.length - 1; index >= 0; index--) stack.push(values[index]);
	}
}

export type OxcParentVisitor = (
	node: OxcNode,
	parent: OxcNode | undefined,
	ancestors: readonly OxcNode[],
) => void;

/** Iterative depth-first AST walk for consumers that need parent context. */
export function walkWithParent(node: unknown, visit: OxcParentVisitor): void {
	type Frame =
		| {
				readonly kind: "enter";
				readonly node: unknown;
				readonly parent: OxcNode | undefined;
				readonly depth: number;
		  }
		| { readonly kind: "leave"; readonly depth: number };

	const frames: Frame[] = [{ kind: "enter", node, parent: undefined, depth: 0 }];
	const ancestors: OxcNode[] = [];
	while (frames.length > 0) {
		const frame = frames.pop()!;
		if (frame.kind === "leave") {
			ancestors.length = frame.depth;
			continue;
		}

		const current = frame.node;
		if (Array.isArray(current)) {
			for (let index = current.length - 1; index >= 0; index--)
				frames.push({
					kind: "enter",
					node: current[index],
					parent: frame.parent,
					depth: frame.depth,
				});
			continue;
		}
		if (current === null || typeof current !== "object") continue;
		const typed = current as OxcNode;
		if (typeof typed.type !== "string") {
			const values = Object.values(typed);
			for (let index = values.length - 1; index >= 0; index--)
				frames.push({
					kind: "enter",
					node: values[index],
					parent: frame.parent,
					depth: frame.depth,
				});
			continue;
		}

		ancestors.length = frame.depth;
		visit(typed, frame.parent, ancestors);
		frames.push({ kind: "leave", depth: frame.depth });
		ancestors.push(typed);
		const values = Object.values(typed);
		for (let index = values.length - 1; index >= 0; index--)
			frames.push({ kind: "enter", node: values[index], parent: typed, depth: frame.depth + 1 });
	}
}

/**
 * Optional module-level constant scope for `evalLiteral`: name -> known
 * value. Only values proven constant by the caller (see the cx inliner's
 * `collectModuleConstants`) should be passed — evalLiteral trusts it.
 */
export type LiteralConstantScope = ReadonlyMap<string, unknown>;

/** Result of finite set evaluation: every value the expression may take. */
export interface LiteralValueSet {
	/** All values the expression can statically produce. */
	readonly values: readonly unknown[];
}

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
		case NodeKind.Literal:
			return node.value;
		case NodeKind.Identifier: {
			const name = (node as unknown as { name?: string }).name;
			if (consts !== undefined && typeof name === "string") {
				const known = consts.get(name);
				if (known !== undefined) return known;
			}
			return undefined;
		}
		case NodeKind.TemplateLiteral: {
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
		case NodeKind.BinaryExpression: {
			if (consts === undefined || node.operator !== "+") return undefined;
			const left = evalLiteral(node.left, consts);
			if (typeof left !== "string") return undefined;
			const right = evalLiteral(node.right, consts);
			if (typeof right !== "string") return undefined;
			return left + right;
		}
		case NodeKind.UnaryExpression: {
			if (node.operator !== "-" || node.argument.type !== NodeKind.Literal) {
				return undefined;
			}
			const value = node.argument.value;
			return typeof value === "number" ? -value : undefined;
		}
		case NodeKind.ArrayExpression: {
			const values: unknown[] = [];
			for (const element of node.elements) {
				if (element === null || element.type === NodeKind.SpreadElement) {
					return undefined;
				}
				const value = evalLiteral(element, consts);
				if (value === undefined) return undefined;
				values.push(value);
			}
			return values;
		}
		case NodeKind.ObjectExpression: {
			const styles: Record<string, unknown> = {};
			for (const property of node.properties) {
				if (
					property.type !== NodeKind.Property ||
					property.kind !== PropertyKindTag.Init ||
					property.computed ||
					property.method ||
					property.shorthand
				) {
					return undefined;
				}
				const key = property.key;
				const name =
					key.type === NodeKind.Identifier
						? key.name
						: key.type === NodeKind.Literal && typeof key.value === "string"
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

/**
 * Statically enumerate the finite value set of an expression. Returns
 * `undefined` when the value space is unbounded or unknown (function calls,
 * non-constant identifiers, spreads of unknown arrays). Where `evalLiteral`
 * answers "is this a single proven value?", `evalLiteralValues` answers
 * "what are all the values this could produce?" - enabling finite candidate
 * discovery for ternaries, short-circuit operators, unions of constants, and
 * cartesian combinations inside arrays/objects. The combination cap is
 * enforced by callers via `literalValueSetSize`.
 */
export function evalLiteralValues(
	node: Expression | undefined,
	consts?: LiteralConstantScope,
): LiteralValueSet | undefined {
	const set = collectValueSet(evalSetNode(node, consts));
	if (set === undefined) return undefined;
	return { values: set };
}

/** True when `node` is a call to the bare identifier `tw`. */
export function isTwCall(node: OxcNode): node is OxcNode & {
	arguments: Expression[];
} {
	return (
		node.type === NodeKind.CallExpression &&
		node.callee !== null &&
		typeof node.callee === "object" &&
		(node.callee as OxcNode).type === NodeKind.Identifier &&
		(node.callee as { name?: string }).name === "tw"
	);
}

type ValueNode = { sets: unknown[] } | { single: unknown };

/**
 * Internal recursive evaluator producing a set-shaped tree: every node is
 * either a single proven value or a finite list of alternatives. Leaves use
 * the same literal rules as evalLiteral; combinator nodes enumerate.
 */
function evalSetNode(node: unknown, consts: LiteralConstantScope | undefined): ValueNode {
	if (node === null || node === undefined) return { single: undefined };
	const type = (node as OxcNode).type;
	switch (type) {
		case NodeKind.Literal:
			return { single: (node as unknown as { value?: unknown }).value };
		case NodeKind.Identifier: {
			const name = (node as unknown as { name?: string }).name;
			if (consts !== undefined && typeof name === "string" && consts.has(name)) {
				return { single: consts.get(name) };
			}
			return { sets: [] };
		}
		case NodeKind.TemplateLiteral: {
			const template = node as unknown as {
				quasis: Array<{ value: { cooked: string | null; raw: string } }>;
				expressions: Expression[];
			};
			if (template.quasis.length !== template.expressions.length + 1) return { sets: [] };
			const pieces: string[] = [
				template.quasis[0]?.value.cooked ?? template.quasis[0]?.value.raw ?? "",
			];
			for (let i = 0; i < template.expressions.length; i++) {
				const part = collectValueSet(evalSetNode(template.expressions[i], consts));
				if (part === undefined) return { sets: [] };
				const tail =
					template.quasis[i + 1]?.value.cooked ?? template.quasis[i + 1]?.value.raw ?? "";
				const next: string[] = [];
				for (const existing of pieces) {
					for (const value of part) {
						if (typeof value !== "string") return { sets: [] };
						next.push(existing + value + tail);
					}
				}
				pieces.length = 0;
				pieces.push(...next);
			}
			return { sets: pieces };
		}
		case NodeKind.BinaryExpression: {
			const binary = node as unknown as { operator: string; left: Expression; right: Expression };
			if (binary.operator !== "+") return { sets: [] };
			const left = collectValueSet(evalSetNode(binary.left, consts));
			if (left === undefined) return { sets: [] };
			const right = collectValueSet(evalSetNode(binary.right, consts));
			if (right === undefined) return { sets: [] };
			const out: string[] = [];
			for (const l of left) {
				for (const r of right) {
					if (typeof l !== "string" || typeof r !== "string") return { sets: [] };
					out.push(l + r);
				}
			}
			return { sets: out };
		}
		case NodeKind.UnaryExpression: {
			const unary = node as unknown as { operator: string; argument: Expression };
			if (unary.operator !== "-") return { sets: [] };
			const inner = evalSetNode(unary.argument, consts);
			if (inner === undefined || !("single" in inner)) return { sets: [] };
			const value = inner.single;
			return typeof value === "number" ? { single: -value } : { sets: [] };
		}
		case NodeKind.ConditionalExpression: {
			const conditional = node as unknown as {
				test: Expression;
				consequent: Expression;
				alternate: Expression | undefined;
			};
			const test = collectValueSet(evalSetNode(conditional.test, consts));
			if (test !== undefined && (test.includes(true) || test.includes(false))) {
				const chosen = test.includes(true) ? conditional.consequent : conditional.alternate;
				return evalBranchUnion([chosen], consts);
			}
			return evalBranchUnion([conditional.consequent, conditional.alternate], consts);
		}
		case NodeKind.LogicalExpression: {
			const logical = node as unknown as { operator: string; left: Expression; right: Expression };
			const left = collectValueSet(evalSetNode(logical.left, consts));
			if (left === undefined) return { sets: [] };
			const right = collectValueSet(evalSetNode(logical.right, consts));
			if (right === undefined) return { sets: [] };
			const values: unknown[] = [];
			if (logical.operator === "&&") {
				const leftTruthy = left.filter((value) => Boolean(value));
				if (leftTruthy.length === 0) return { single: left[0] ?? false };
				if (leftTruthy.length !== left.length) values.push(false);
				for (const value of leftTruthy) {
					if (typeof value === "boolean" || value === null) {
						values.push(false);
					} else {
						values.push(...right);
					}
				}
				return { sets: values };
			}
			if (logical.operator === "||") {
				for (const value of left) {
					if (value) {
						values.push(value);
					} else {
						values.push(...right);
					}
				}
				return { sets: values };
			}
			if (logical.operator === "??") {
				for (const value of left) {
					if (value === null || value === undefined) {
						values.push(...right);
					} else {
						values.push(value);
					}
				}
				return { sets: values };
			}
			return { sets: [] };
		}
		case NodeKind.ArrayExpression: {
			const array = node as unknown as { elements: Array<Expression | null | { type: string }> };
			const entries: Array<readonly unknown[]> = [];
			for (const element of array.elements) {
				if (element === null || (element as { type: string }).type === NodeKind.SpreadElement) {
					return { sets: [] };
				}
				const valueSet = collectValueSet(evalSetNode(element, consts));
				if (valueSet === undefined) return { sets: [] };
				entries.push(valueSet);
			}
			const combinations: unknown[][] = [];
			const build = (index: number, current: unknown[]): void => {
				if (index === entries.length) {
					combinations.push([...current]);
					return;
				}
				for (const value of entries[index]!) {
					current[index] = value;
					build(index + 1, current);
				}
			};
			build(0, []);
			return { sets: combinations };
		}
		case NodeKind.ObjectExpression: {
			const object = node as unknown as { properties: unknown[] };
			const keys: string[] = [];
			const entries: Array<readonly unknown[]> = [];
			for (const property of object.properties) {
				const prop = property as {
					type: string;
					kind: string;
					computed: boolean;
					method: boolean;
					shorthand: boolean;
					key: { type: string; name?: string; value?: unknown };
					value: Expression;
				};
				if (
					prop.type !== NodeKind.Property ||
					prop.kind !== PropertyKindTag.Init ||
					prop.computed ||
					prop.method ||
					prop.shorthand
				) {
					return { sets: [] };
				}
				const key = prop.key;
				const name =
					key.type === NodeKind.Identifier
						? key.name
						: key.type === NodeKind.Literal && typeof key.value === "string"
							? (key.value as string)
							: undefined;
				if (name === undefined) return { sets: [] };
				const valueSet = collectValueSet(evalSetNode(prop.value, consts));
				if (valueSet === undefined) return { sets: [] };
				keys.push(name);
				entries.push(valueSet);
			}
			const objects: Record<string, unknown>[] = [];
			const build = (index: number, current: Record<string, unknown>): void => {
				if (index === entries.length) {
					objects.push({ ...current });
					return;
				}
				for (const value of entries[index]!) {
					current[keys[index]!] = value;
					build(index + 1, current);
				}
			};
			build(0, {});
			return { sets: objects };
		}
		default:
			return { sets: [] };
	}
}

function evalBranchUnion(
	branches: Array<Expression | undefined>,
	consts: LiteralConstantScope | undefined,
): ValueNode {
	const values: unknown[] = [];
	for (const branch of branches) {
		const branchValues = collectValueSet(evalSetNode(branch, consts));
		if (branchValues === undefined) return { sets: [] };
		values.push(...branchValues);
	}
	return { sets: values };
}

/**
 * Flatten a set-tree to a concrete value list. Returns undefined for an
 * empty or unbounded set, or a set exceeding the combination cap.
 */
function collectValueSet(node: ValueNode | undefined, cap = 256): readonly unknown[] | undefined {
	if (node === undefined) return undefined;
	if ("single" in node) return [node.single];
	if (node.sets.length === 0 || node.sets.length > cap) return undefined;
	return node.sets;
}

/** Total number of combinations a value set represents (0 when unbounded). */
export function literalValueSetSize(set: LiteralValueSet | undefined): number {
	return set === undefined ? 0 : set.values.length;
}
