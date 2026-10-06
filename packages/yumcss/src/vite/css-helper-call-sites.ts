import { NodeKind, PropertyKindTag } from "../ast-node-kind.ts";
import type { LiteralCallEvaluator, LiteralConstantScope, OxcNode } from "../tw/literal.ts";
import { walkWithParent } from "../tw/literal.ts";
import type { CssLiteralScopeResolver } from "./css-literal-scope.ts";

interface CallNode extends OxcNode {
	readonly start: number;
	readonly end: number;
	readonly callee: OxcNode | null;
	readonly arguments: OxcNode[];
}

interface HelperDefinition {
	readonly name: string;
	readonly parameters: readonly string[];
	readonly style: OxcNode;
	readonly constants: LiteralConstantScope;
}

export interface StaticCssHelperCallSite {
	readonly start: number;
	readonly end: number;
	readonly style: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const evaluateStaticCssValue = (
	node: OxcNode | undefined,
	constants: LiteralConstantScope,
	evaluateCall?: LiteralCallEvaluator,
	depth = 0,
): unknown => {
	if (node === undefined || depth > 32) return undefined;
	switch (node.type) {
		case NodeKind.Literal:
			return (node as { value?: unknown }).value;
		case NodeKind.Identifier: {
			const name = (node as { name?: string }).name;
			return name !== undefined && constants.has(name) ? constants.get(name) : undefined;
		}
		case NodeKind.ConditionalExpression: {
			const conditional = node as {
				test?: OxcNode;
				consequent?: OxcNode;
				alternate?: OxcNode;
			};
			const test = evaluateStaticCssValue(conditional.test, constants, evaluateCall, depth + 1);
			if (test === undefined) return undefined;
			return evaluateStaticCssValue(
				test ? conditional.consequent : conditional.alternate,
				constants,
				evaluateCall,
				depth + 1,
			);
		}
		case NodeKind.LogicalExpression: {
			const logical = node as { operator?: string; left?: OxcNode; right?: OxcNode };
			const left = evaluateStaticCssValue(logical.left, constants, evaluateCall, depth + 1);
			if (left === undefined) return undefined;
			if (logical.operator === "&&")
				return left
					? evaluateStaticCssValue(logical.right, constants, evaluateCall, depth + 1)
					: left;
			if (logical.operator === "||")
				return left
					? left
					: evaluateStaticCssValue(logical.right, constants, evaluateCall, depth + 1);
			if (logical.operator === "??")
				return left === null
					? evaluateStaticCssValue(logical.right, constants, evaluateCall, depth + 1)
					: left;
			return undefined;
		}
		case NodeKind.BinaryExpression: {
			const binary = node as { operator?: string; left?: OxcNode; right?: OxcNode };
			const left = evaluateStaticCssValue(binary.left, constants, evaluateCall, depth + 1);
			const right = evaluateStaticCssValue(binary.right, constants, evaluateCall, depth + 1);
			if (left === undefined || right === undefined) return undefined;
			switch (binary.operator) {
				case "===":
					return left === right;
				case "!==":
					return left !== right;
				case "+":
					if (typeof left === "string" && typeof right === "string") return left + right;
					if (typeof left === "number" && typeof right === "number") return left + right;
					return undefined;
				case "-":
					return typeof left === "number" && typeof right === "number" ? left - right : undefined;
				case "*":
					return typeof left === "number" && typeof right === "number" ? left * right : undefined;
				case "/":
					return typeof left === "number" && typeof right === "number" && right !== 0
						? left / right
						: undefined;
				case ">":
					if (typeof left === "number" && typeof right === "number") return left > right;
					if (typeof left === "string" && typeof right === "string") return left > right;
					return undefined;
				case ">=":
					if (typeof left === "number" && typeof right === "number") return left >= right;
					if (typeof left === "string" && typeof right === "string") return left >= right;
					return undefined;
				case "<":
					if (typeof left === "number" && typeof right === "number") return left < right;
					if (typeof left === "string" && typeof right === "string") return left < right;
					return undefined;
				case "<=":
					if (typeof left === "number" && typeof right === "number") return left <= right;
					if (typeof left === "string" && typeof right === "string") return left <= right;
					return undefined;
				default:
					return undefined;
			}
		}
		case NodeKind.UnaryExpression: {
			const unary = node as { operator?: string; argument?: OxcNode };
			const value = evaluateStaticCssValue(unary.argument, constants, evaluateCall, depth + 1);
			if (value === undefined) return undefined;
			if (unary.operator === "!") return !value;
			if (unary.operator === "-" && typeof value === "number") return -value;
			if (unary.operator === "+" && typeof value === "number") return value;
			return undefined;
		}
		case NodeKind.TemplateLiteral: {
			const template = node as {
				quasis?: Array<{ value?: { cooked?: string | null; raw?: string } }>;
				expressions?: OxcNode[];
			};
			const quasis = template.quasis ?? [];
			const expressions = template.expressions ?? [];
			if (quasis.length !== expressions.length + 1) return undefined;
			let value = quasis[0]?.value?.cooked ?? quasis[0]?.value?.raw ?? "";
			for (let index = 0; index < expressions.length; index++) {
				const part = evaluateStaticCssValue(expressions[index], constants, evaluateCall, depth + 1);
				if (part === undefined || (typeof part === "object" && part !== null)) return undefined;
				value += String(part);
				value += quasis[index + 1]?.value?.cooked ?? quasis[index + 1]?.value?.raw ?? "";
			}
			return value;
		}
		case NodeKind.ObjectExpression: {
			const object = node as { properties?: OxcNode[] };
			const result: Record<string, unknown> = {};
			for (const property of object.properties ?? []) {
				if (property.type === NodeKind.SpreadElement) {
					const spread = evaluateStaticCssValue(
						(property as { argument?: OxcNode }).argument,
						constants,
						evaluateCall,
						depth + 1,
					);
					if (!isRecord(spread)) return undefined;
					const prototype = Object.getPrototypeOf(spread);
					if (prototype !== Object.prototype && prototype !== null) return undefined;
					for (const key of Object.keys(spread)) {
						if (key === "__proto__") return undefined;
						const descriptor = Object.getOwnPropertyDescriptor(spread, key);
						if (descriptor === undefined || !("value" in descriptor)) return undefined;
						Object.defineProperty(result, String(key), {
							configurable: true,
							enumerable: true,
							value: descriptor.value,
							writable: true,
						});
					}
					continue;
				}
				if (property.type !== NodeKind.Property) return undefined;
				const entry = property as {
					key?: OxcNode;
					value?: OxcNode;
					kind?: string;
					computed?: boolean;
					method?: boolean;
				};
				if (entry.kind !== PropertyKindTag.Init || entry.method === true) return undefined;
				const key =
					entry.key === undefined
						? undefined
						: entry.computed === true
							? evaluateStaticCssValue(entry.key, constants, evaluateCall, depth + 1)
							: entry.key.type === NodeKind.Identifier
								? (entry.key as { name?: string }).name
								: (entry.key as { value?: unknown }).value;
				if ((typeof key !== "string" && typeof key !== "number") || String(key) === "__proto__")
					return undefined;
				const value = evaluateStaticCssValue(entry.value, constants, evaluateCall, depth + 1);
				if (value === undefined) return undefined;
				Object.defineProperty(result, key, {
					configurable: true,
					enumerable: true,
					value,
					writable: true,
				});
			}
			return result;
		}
		case NodeKind.ArrayExpression: {
			const array = node as { elements?: Array<OxcNode | null> };
			const values: unknown[] = [];
			for (const element of array.elements ?? []) {
				if (element === null || element.type === NodeKind.SpreadElement) return undefined;
				const value = evaluateStaticCssValue(element, constants, evaluateCall, depth + 1);
				if (value === undefined) return undefined;
				values.push(value);
			}
			return values;
		}
		case NodeKind.MemberExpression: {
			const member = node as { object?: OxcNode; property?: OxcNode; computed?: boolean };
			const object = evaluateStaticCssValue(member.object, constants, evaluateCall, depth + 1);
			if (object === null || typeof object !== "object") return undefined;
			const property =
				member.computed === true
					? evaluateStaticCssValue(member.property, constants, evaluateCall, depth + 1)
					: (member.property as { name?: string } | undefined)?.name;
			if (typeof property !== "string" && typeof property !== "number") return undefined;
			const descriptor = Object.getOwnPropertyDescriptor(object, String(property));
			return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
		}
		case NodeKind.TSAsExpression:
		case NodeKind.TSSatisfiesExpression:
		case NodeKind.TSTypeAssertion:
		case NodeKind.ParenthesizedExpression:
			return evaluateStaticCssValue(
				(node as { expression?: OxcNode }).expression,
				constants,
				evaluateCall,
				depth + 1,
			);
		case NodeKind.CallExpression:
			return evaluateCall?.(node as never, constants);
		default:
			return undefined;
	}
};

const cssClassCall = (node: OxcNode, names: ReadonlySet<string>): OxcNode | undefined => {
	if (node.type !== NodeKind.CallExpression) return undefined;
	const call = node as CallNode;
	if (call.arguments.length !== 1) return undefined;
	const callee = call.callee as {
		type?: string;
		object?: OxcNode | null;
		property?: OxcNode | null;
		computed?: boolean;
	} | null;
	if (
		callee?.type !== NodeKind.MemberExpression ||
		callee.computed === true ||
		(callee.property as { name?: string } | null)?.name !== "class" ||
		(callee.object as { type?: string; name?: string } | null)?.type !== NodeKind.Identifier ||
		!names.has((callee.object as { name?: string }).name ?? "")
	)
		return undefined;
	return call.arguments[0];
};

const helperShape = (
	initializer: OxcNode | null | undefined,
	names: ReadonlySet<string>,
): { readonly parameters: readonly string[]; readonly style: OxcNode } | undefined => {
	if (initializer?.type !== NodeKind.ArrowFunctionExpression) return undefined;
	const arrow = initializer as {
		params?: OxcNode[];
		body?: OxcNode;
		async?: boolean;
		generator?: boolean;
	};
	if (arrow.async === true || arrow.generator === true) return undefined;
	const parameters: string[] = [];
	for (const parameter of arrow.params ?? []) {
		if (parameter.type !== NodeKind.Identifier) return undefined;
		const name = (parameter as { name?: string }).name;
		if (name === undefined) return undefined;
		parameters.push(name);
	}
	let returned = arrow.body;
	if (returned?.type === NodeKind.BlockStatement) {
		const statements = (returned as { body?: OxcNode[] }).body ?? [];
		if (statements.length !== 1 || statements[0]?.type !== NodeKind.ReturnStatement)
			return undefined;
		returned = (statements[0] as { argument?: OxcNode | null }).argument ?? undefined;
	}
	const style = returned === undefined ? undefined : cssClassCall(returned, names);
	return style === undefined ? undefined : { parameters, style };
};

const lexicalScopeTypes = new Set([
	NodeKind.BlockStatement,
	NodeKind.FunctionDeclaration,
	NodeKind.FunctionExpression,
	NodeKind.ArrowFunctionExpression,
	NodeKind.ForStatement,
	NodeKind.ForInStatement,
	NodeKind.ForOfStatement,
	NodeKind.CatchClause,
	"SwitchStatement",
	"ClassBody",
	"StaticBlock",
	"TSModuleBlock",
]);

const isTopLevelContext = (ancestors: readonly OxcNode[]): boolean =>
	ancestors.some((ancestor) => ancestor.type === NodeKind.Program) &&
	!ancestors.some((ancestor) => lexicalScopeTypes.has(ancestor.type));

export const findStaticCssHelperCallSites = (
	program: OxcNode,
	names: ReadonlySet<string>,
	resolveLiteralScope: CssLiteralScopeResolver,
	evaluateCall: LiteralCallEvaluator,
): readonly StaticCssHelperCallSite[] => {
	if (names.size === 0) return [];
	const helpers = new Map<string, HelperDefinition>();
	const ambiguousHelpers = new Set<string>();
	walkWithParent(program, (node, _parent, ancestors) => {
		if (
			node.type !== NodeKind.VariableDeclarator ||
			!isTopLevelContext(ancestors) ||
			ancestors.at(-1)?.type !== NodeKind.VariableDeclaration
		)
			return;
		const declarator = node as { id?: OxcNode; init?: OxcNode | null };
		const name =
			declarator.id?.type === NodeKind.Identifier
				? (declarator.id as { name?: string }).name
				: undefined;
		const declaration = ancestors.at(-1) as { kind?: string } | undefined;
		if (name === undefined || declaration?.kind !== "const") return;
		const shape = helperShape(declarator.init, names);
		if (shape === undefined) return;
		if (helpers.has(name)) {
			helpers.delete(name);
			ambiguousHelpers.add(name);
			return;
		}
		if (ambiguousHelpers.has(name)) return;
		const helperFunction = declarator.init as OxcNode;
		const helperConstants = resolveLiteralScope(helperFunction, [...ancestors, node]);
		helpers.set(name, { name, ...shape, constants: helperConstants });
	});
	if (helpers.size === 0) return [];
	const callSites: StaticCssHelperCallSite[] = [];
	walkWithParent(program, (node, _parent, ancestors) => {
		if (node.type !== NodeKind.CallExpression || !isTopLevelContext(ancestors)) return;
		const call = node as CallNode;
		if (call.callee?.type !== NodeKind.Identifier) return;
		const helper = helpers.get((call.callee as { name?: string }).name ?? "");
		if (helper === undefined || call.arguments.length !== helper.parameters.length) return;
		const callConstants = resolveLiteralScope(call, ancestors);
		const values = call.arguments.map((argument) =>
			evaluateStaticCssValue(argument, callConstants, evaluateCall),
		);
		if (values.some((value) => value === undefined)) return;
		const helperConstants = new Map(helper.constants);
		for (const [index, name] of helper.parameters.entries()) {
			helperConstants.set(name, values[index]);
		}
		const style = evaluateStaticCssValue(helper.style, helperConstants, evaluateCall);
		if (!isRecord(style)) return;
		callSites.push({ start: call.start, end: call.end, style });
	});
	return callSites;
};
