import { NodeKind, VariableDeclarationKindTag } from "../ast-node-kind.ts";
import {
	evalLiteral,
	type LiteralCallEvaluator,
	type LiteralConstantScope,
	type OxcNode,
} from "../tw/literal.ts";

interface RangedNode extends OxcNode {
	readonly start?: number;
}

interface VariableDeclarationNode extends OxcNode {
	readonly kind?: string;
	readonly declarations?: readonly OxcNode[];
}

interface VariableDeclaratorNode extends OxcNode {
	readonly id?: OxcNode;
	readonly init?: OxcNode | null;
}

interface FunctionNode extends OxcNode {
	readonly id?: OxcNode | null;
	readonly params?: readonly OxcNode[];
	readonly body?: OxcNode | null;
}

interface ModuleConstant {
	readonly value: unknown;
	readonly declStart: number;
}

const isFunction = (node: OxcNode): boolean =>
	node.type === NodeKind.FunctionDeclaration ||
	node.type === NodeKind.FunctionExpression ||
	node.type === NodeKind.ArrowFunctionExpression;

const nodeStart = (node: OxcNode | undefined): number =>
	typeof (node as RangedNode | undefined)?.start === "number"
		? (node as RangedNode).start!
		: Number.POSITIVE_INFINITY;

const bindingNames = (node: OxcNode | null | undefined, names: Set<string>): void => {
	if (node === null || node === undefined) return;
	switch (node.type) {
		case NodeKind.Identifier: {
			const name = (node as { name?: string }).name;
			if (name !== undefined) names.add(name);
			return;
		}
		case NodeKind.AssignmentPattern:
			bindingNames((node as { left?: OxcNode }).left, names);
			return;
		case NodeKind.ArrayPattern:
			for (const element of (node as { elements?: readonly OxcNode[] | readonly null[] })
				.elements ?? [])
				bindingNames(element, names);
			return;
		case NodeKind.ObjectPattern:
			for (const property of (node as { properties?: readonly OxcNode[] }).properties ?? []) {
				if (property.type === NodeKind.RestElement) {
					bindingNames((property as { argument?: OxcNode }).argument, names);
					continue;
				}
				if (property.type === NodeKind.Property)
					bindingNames((property as { value?: OxcNode }).value, names);
			}
			return;
		case NodeKind.RestElement:
			bindingNames((node as { argument?: OxcNode }).argument, names);
			return;
		default:
			return;
	}
};

const declarationFromStatement = (statement: OxcNode): OxcNode | undefined =>
	statement.type === NodeKind.ExportNamedDeclaration
		? ((statement as { declaration?: OxcNode | null }).declaration ?? undefined)
		: statement;

const directVariableDeclarations = (container: OxcNode): readonly VariableDeclarationNode[] => {
	const body = (container as { body?: readonly OxcNode[] }).body;
	if (body === undefined) return [];
	return body.flatMap((statement) => {
		const declaration = declarationFromStatement(statement);
		return declaration?.type === NodeKind.VariableDeclaration
			? [declaration as VariableDeclarationNode]
			: [];
	});
};

const directBindings = (container: OxcNode): Set<string> => {
	const names = new Set<string>();
	const body = (container as { body?: readonly OxcNode[] }).body ?? [];
	for (const statement of body) {
		const declaration = declarationFromStatement(statement);
		if (declaration?.type === NodeKind.VariableDeclaration) {
			for (const variable of (declaration as VariableDeclarationNode).declarations ?? [])
				bindingNames((variable as VariableDeclaratorNode).id, names);
			continue;
		}
		if (
			declaration?.type === NodeKind.FunctionDeclaration ||
			declaration?.type === NodeKind.ClassDeclaration
		)
			bindingNames((declaration as { id?: OxcNode }).id, names);
	}
	return names;
};

const collectVarBindings = (root: OxcNode, names: Set<string>): void => {
	const stack: OxcNode[] = [root];
	while (stack.length > 0) {
		const current = stack.pop()!;
		if (current !== root && isFunction(current)) continue;
		if (
			current.type === NodeKind.VariableDeclaration &&
			(current as VariableDeclarationNode).kind === VariableDeclarationKindTag.Var
		) {
			for (const variable of (current as VariableDeclarationNode).declarations ?? [])
				bindingNames((variable as VariableDeclaratorNode).id, names);
		}
		for (const [key, value] of Object.entries(current)) {
			if (key === "parent") continue;
			if (Array.isArray(value)) {
				for (const child of value)
					if (
						child !== null &&
						typeof child === "object" &&
						typeof (child as OxcNode).type === "string"
					)
						stack.push(child as OxcNode);
			} else if (
				value !== null &&
				typeof value === "object" &&
				typeof (value as OxcNode).type === "string"
			)
				stack.push(value as OxcNode);
		}
	}
};

const collectModuleConstants = (
	program: OxcNode,
	evaluateCall: LiteralCallEvaluator,
): ReadonlyMap<string, ModuleConstant> => {
	const values = new Map<string, unknown>();
	const constants = new Map<string, ModuleConstant>();
	for (const declaration of directVariableDeclarations(program)) {
		if (declaration.kind !== VariableDeclarationKindTag.Const) continue;
		for (const variable of declaration.declarations ?? []) {
			const binding = variable as VariableDeclaratorNode;
			const name =
				binding.id?.type === NodeKind.Identifier
					? (binding.id as { name?: string }).name
					: undefined;
			if (name === undefined || binding.init === undefined || binding.init === null) continue;
			const value = evalLiteral(binding.init as never, values, evaluateCall);
			if (value === undefined) continue;
			values.set(name, value);
			constants.set(name, { value, declStart: nodeStart(variable) });
		}
	}
	return constants;
};

const applyVariableScope = (
	scope: Map<string, unknown>,
	declaration: VariableDeclarationNode | undefined,
	useStart: number,
	evaluateCall: LiteralCallEvaluator,
): void => {
	if (declaration === undefined) return;
	const declarations = declaration.declarations ?? [];
	const names = new Set<string>();
	for (const variable of declarations) bindingNames((variable as VariableDeclaratorNode).id, names);
	for (const name of names) scope.delete(name);
	if (declaration.kind !== VariableDeclarationKindTag.Const) return;
	for (const variable of declarations) {
		const binding = variable as VariableDeclaratorNode;
		const name =
			binding.id?.type === NodeKind.Identifier ? (binding.id as { name?: string }).name : undefined;
		if (name === undefined || binding.init === undefined || binding.init === null) continue;
		if (nodeStart(variable) >= useStart) continue;
		const value = evalLiteral(binding.init as never, scope, evaluateCall);
		if (value !== undefined) scope.set(name, value);
	}
};

const applyBlockScope = (
	scope: Map<string, unknown>,
	block: OxcNode,
	useStart: number,
	evaluateCall: LiteralCallEvaluator,
): void => {
	for (const name of directBindings(block)) scope.delete(name);
	for (const declaration of directVariableDeclarations(block))
		applyVariableScope(scope, declaration, useStart, evaluateCall);
};

const applyFunctionScope = (scope: Map<string, unknown>, functionNode: FunctionNode): void => {
	const names = new Set<string>();
	bindingNames(functionNode.id, names);
	for (const parameter of functionNode.params ?? []) bindingNames(parameter, names);
	if (functionNode.body !== null && functionNode.body !== undefined)
		collectVarBindings(functionNode.body, names);
	for (const name of names) scope.delete(name);
};

const applyForScope = (
	scope: Map<string, unknown>,
	node: OxcNode,
	useStart: number,
	evaluateCall: LiteralCallEvaluator,
): void => {
	const declaration =
		node.type === NodeKind.ForStatement
			? (node as { init?: OxcNode | null }).init
			: (node as { left?: OxcNode | null }).left;
	if (declaration?.type === NodeKind.VariableDeclaration)
		applyVariableScope(scope, declaration as VariableDeclarationNode, useStart, evaluateCall);
};

export type CssLiteralScopeResolver = (
	node: OxcNode,
	ancestors: readonly OxcNode[],
) => LiteralConstantScope;

export const createCssLiteralScopeResolver = (
	program: OxcNode,
	evaluateCall: LiteralCallEvaluator,
): CssLiteralScopeResolver => {
	const moduleConstants = collectModuleConstants(program, evaluateCall);
	return (node, ancestors) => {
		const useStart = nodeStart(node);
		const scope = new Map<string, unknown>();
		for (const [name, constant] of moduleConstants) {
			if (constant.declStart < useStart) scope.set(name, constant.value);
		}
		for (const ancestor of ancestors) {
			if (isFunction(ancestor)) {
				applyFunctionScope(scope, ancestor as FunctionNode);
				continue;
			}
			if (ancestor.type === NodeKind.BlockStatement) {
				applyBlockScope(scope, ancestor, useStart, evaluateCall);
				continue;
			}
			if (ancestor.type === NodeKind.CatchClause) {
				const names = new Set<string>();
				bindingNames((ancestor as { param?: OxcNode | null }).param, names);
				for (const name of names) scope.delete(name);
				continue;
			}
			if (
				ancestor.type === NodeKind.ForStatement ||
				ancestor.type === NodeKind.ForInStatement ||
				ancestor.type === NodeKind.ForOfStatement
			)
				applyForScope(scope, ancestor, useStart, evaluateCall);
		}
		return scope;
	};
};
