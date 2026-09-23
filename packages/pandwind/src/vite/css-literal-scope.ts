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

interface BlockScopeData {
	readonly bindings: ReadonlySet<string>;
	readonly declarations: readonly VariableDeclarationNode[];
}

interface ScopeLayer {
	readonly bindings: ReadonlySet<string>;
	readonly values: Map<string, unknown>;
}

const blockScopeDataCache = new WeakMap<OxcNode, BlockScopeData>();
const functionScopeBindingsCache = new WeakMap<OxcNode, ReadonlySet<string>>();
const declarationBindingsCache = new WeakMap<OxcNode, ReadonlySet<string>>();

class CssLiteralConstantScope implements ReadonlyMap<string, unknown> {
	readonly #layers: ScopeLayer[] = [];
	readonly #moduleConstants: ReadonlyMap<string, ModuleConstant>;
	readonly #useStart: number;

	constructor(moduleConstants: ReadonlyMap<string, ModuleConstant>, useStart: number) {
		this.#moduleConstants = moduleConstants;
		this.#useStart = useStart;
	}

	pushLayer(bindings: ReadonlySet<string>): void {
		this.#layers.push({ bindings, values: new Map() });
	}

	set(name: string, value: unknown): void {
		const layer = this.#layers.at(-1);
		if (layer === undefined) throw new Error("literal scope has no active layer");
		layer.values.set(name, value);
	}

	get(name: string): unknown {
		for (let index = this.#layers.length - 1; index >= 0; index -= 1) {
			const layer = this.#layers[index];
			if (layer === undefined) continue;
			if (layer.values.has(name)) return layer.values.get(name);
			if (layer.bindings.has(name)) return undefined;
		}
		const constant = this.#moduleConstants.get(name);
		return constant !== undefined && constant.declStart < this.#useStart
			? constant.value
			: undefined;
	}

	has(name: string): boolean {
		for (let index = this.#layers.length - 1; index >= 0; index -= 1) {
			const layer = this.#layers[index];
			if (layer === undefined) continue;
			if (layer.values.has(name)) return true;
			if (layer.bindings.has(name)) return false;
		}
		const constant = this.#moduleConstants.get(name);
		return constant !== undefined && constant.declStart < this.#useStart;
	}

	get size(): number {
		return this.#materialize().size;
	}

	entries() {
		return this.#materialize().entries();
	}

	keys() {
		return this.#materialize().keys();
	}

	values() {
		return this.#materialize().values();
	}

	[Symbol.iterator]() {
		return this.entries();
	}

	forEach(
		callback: (value: unknown, key: string, map: ReadonlyMap<string, unknown>) => void,
		thisArg?: unknown,
	): void {
		for (const [key, value] of this) callback.call(thisArg, value, key, this);
	}

	#materialize(): Map<string, unknown> {
		const scope = new Map<string, unknown>();
		for (const [name, constant] of this.#moduleConstants) {
			if (constant.declStart < this.#useStart) scope.set(name, constant.value);
		}
		for (const layer of this.#layers) {
			for (const name of layer.bindings) scope.delete(name);
			for (const [name, value] of layer.values) scope.set(name, value);
		}
		return scope;
	}
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

const blockScopeData = (container: OxcNode): BlockScopeData => {
	const cached = blockScopeDataCache.get(container);
	if (cached !== undefined) return cached;
	const bindings = new Set<string>();
	const declarations: VariableDeclarationNode[] = [];
	const body = (container as { body?: readonly OxcNode[] }).body ?? [];
	for (const statement of body) {
		const declaration = declarationFromStatement(statement);
		if (declaration?.type === NodeKind.VariableDeclaration) {
			const variableDeclaration = declaration as VariableDeclarationNode;
			declarations.push(variableDeclaration);
			for (const variable of variableDeclaration.declarations ?? [])
				bindingNames((variable as VariableDeclaratorNode).id, bindings);
			continue;
		}
		if (
			declaration?.type === NodeKind.FunctionDeclaration ||
			declaration?.type === NodeKind.ClassDeclaration
		)
			bindingNames((declaration as { id?: OxcNode }).id, bindings);
	}
	const result = { bindings, declarations };
	blockScopeDataCache.set(container, result);
	return result;
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
	for (const declaration of blockScopeData(program).declarations) {
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
	scope: CssLiteralConstantScope,
	declaration: VariableDeclarationNode | undefined,
	useStart: number,
	evaluateCall: LiteralCallEvaluator,
): void => {
	if (declaration === undefined) return;
	const declarations = declaration.declarations ?? [];
	const cachedNames = declarationBindingsCache.get(declaration);
	if (cachedNames !== undefined) {
		scope.pushLayer(cachedNames);
	} else {
		const names = new Set<string>();
		for (const variable of declarations)
			bindingNames((variable as VariableDeclaratorNode).id, names);
		declarationBindingsCache.set(declaration, names);
		scope.pushLayer(names);
	}
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
	scope: CssLiteralConstantScope,
	block: OxcNode,
	useStart: number,
	evaluateCall: LiteralCallEvaluator,
): void => {
	const data = blockScopeData(block);
	scope.pushLayer(data.bindings);
	for (const declaration of data.declarations)
		applyVariableScope(scope, declaration, useStart, evaluateCall);
};

const functionScopeBindings = (functionNode: FunctionNode): ReadonlySet<string> => {
	const cached = functionScopeBindingsCache.get(functionNode);
	if (cached !== undefined) return cached;
	const names = new Set<string>();
	bindingNames(functionNode.id, names);
	for (const parameter of functionNode.params ?? []) bindingNames(parameter, names);
	if (functionNode.body !== null && functionNode.body !== undefined)
		collectVarBindings(functionNode.body, names);
	functionScopeBindingsCache.set(functionNode, names);
	return names;
};

const applyForScope = (
	scope: CssLiteralConstantScope,
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
		const scope = new CssLiteralConstantScope(moduleConstants, useStart);
		for (const ancestor of ancestors) {
			if (isFunction(ancestor)) {
				scope.pushLayer(functionScopeBindings(ancestor as FunctionNode));
				continue;
			}
			if (ancestor.type === NodeKind.BlockStatement) {
				applyBlockScope(scope, ancestor, useStart, evaluateCall);
				continue;
			}
			if (ancestor.type === NodeKind.CatchClause) {
				const names = new Set<string>();
				bindingNames((ancestor as { param?: OxcNode | null }).param, names);
				scope.pushLayer(names);
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
