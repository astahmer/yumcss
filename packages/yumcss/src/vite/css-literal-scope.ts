import { NodeKind, VariableDeclarationKindTag } from "../ast-node-kind.ts";
import {
	evalLiteral,
	type LiteralCallEvaluator,
	type OxcNode,
	walkWithParent,
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
	readonly #unsafeObjects: ReadonlySet<string>;

	constructor(
		moduleConstants: ReadonlyMap<string, ModuleConstant>,
		useStart: number,
		unsafeObjects: ReadonlySet<string>,
	) {
		this.#moduleConstants = moduleConstants;
		this.#useStart = useStart;
		this.#unsafeObjects = unsafeObjects;
	}

	pushLayer(bindings: ReadonlySet<string>): void {
		this.#layers.push({ bindings, values: new Map() });
	}

	set(name: string, value: unknown): void {
		const layer = this.#layers.at(-1);
		if (layer === undefined) throw new Error("literal scope has no active layer");
		layer.values.set(name, value);
	}

	isShadowed(name: string): boolean {
		return this.#layers.some((layer) => layer.bindings.has(name));
	}

	get(name: string): unknown {
		if (this.#unsafeObjects.has(name)) return undefined;
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
		if (this.#unsafeObjects.has(name)) return false;
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
		for (const name of this.#unsafeObjects) scope.delete(name);
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
	const body =
		container.type === NodeKind.SwitchStatement
			? (
					(container as { cases?: readonly { consequent?: readonly OxcNode[] }[] }).cases ?? []
				).flatMap((branch) => branch.consequent ?? [])
			: ((container as { body?: readonly OxcNode[] }).body ?? []);
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
): Map<string, ModuleConstant> => {
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
	// Switch cases share a scope, but source order does not prove a case initializer ran.
	if (block.type === NodeKind.SwitchStatement) return;
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

export const bindingIsShadowedInAncestors = (
	name: string,
	ancestors: readonly OxcNode[],
): boolean =>
	ancestors.some((ancestor) => {
		if (isFunction(ancestor)) return functionScopeBindings(ancestor as FunctionNode).has(name);
		if (
			ancestor.type === NodeKind.BlockStatement ||
			ancestor.type === NodeKind.SwitchStatement ||
			ancestor.type === NodeKind.StaticBlock
		)
			return blockScopeData(ancestor).bindings.has(name);
		const names = new Set<string>();
		if (ancestor.type === NodeKind.CatchClause)
			bindingNames((ancestor as { param?: OxcNode }).param, names);
		if (
			ancestor.type === NodeKind.ForStatement ||
			ancestor.type === NodeKind.ForOfStatement ||
			ancestor.type === NodeKind.ForInStatement
		) {
			const declaration =
				(ancestor as { init?: VariableDeclarationNode; left?: VariableDeclarationNode }).init ??
				(ancestor as { left?: VariableDeclarationNode }).left;
			for (const variable of declaration?.declarations ?? [])
				bindingNames((variable as VariableDeclaratorNode).id, names);
		}
		return names.has(name);
	});

const collectUnsafeObjectBindings = (
	program: OxcNode,
	styleNames: ReadonlySet<string>,
	moduleConstants: ReadonlyMap<string, ModuleConstant>,
	evaluateCall: LiteralCallEvaluator,
): ReadonlySet<string> => {
	const candidates = new Set<string>();
	const unsafe = new Set<string>();
	const unwrapExpression = (node: OxcNode | null | undefined): OxcNode | undefined => {
		let expression = node ?? undefined;
		while (
			expression?.type === NodeKind.TSAsExpression ||
			expression?.type === NodeKind.TSSatisfiesExpression ||
			expression?.type === NodeKind.TSTypeAssertion ||
			expression?.type === NodeKind.ParenthesizedExpression
		) {
			expression = (expression as { expression?: OxcNode }).expression;
		}
		return expression;
	};
	walkWithParent(program, (node, _parent, ancestors) => {
		if (node.type !== NodeKind.VariableDeclarator) return;
		const variable = node as VariableDeclaratorNode;
		const name =
			variable.id?.type === NodeKind.Identifier
				? (variable.id as { name?: string }).name
				: undefined;
		if (name === undefined || variable.init === undefined || variable.init === null) return;
		const initializer = unwrapExpression(variable.init);
		if (
			initializer?.type === NodeKind.ObjectExpression ||
			initializer?.type === NodeKind.ArrayExpression ||
			initializer?.type === NodeKind.Identifier ||
			initializer?.type === NodeKind.MemberExpression
		) {
			candidates.add(name);
			if (ancestors.some((ancestor) => ancestor.type === NodeKind.ExportNamedDeclaration))
				unsafe.add(name);
		}
	});
	const rootName = (node: OxcNode | null | undefined): string | undefined => {
		let root = unwrapExpression(node);
		while (root?.type === NodeKind.MemberExpression) {
			root = unwrapExpression((root as { object?: OxcNode }).object);
		}
		return root?.type === NodeKind.Identifier ? (root as { name?: string }).name : undefined;
	};
	const isKnownPrimitiveMemberRead = (
		reference: OxcNode,
		name: string,
		ancestors: readonly OxcNode[],
	): boolean => {
		if (
			reference.type !== NodeKind.MemberExpression ||
			bindingIsShadowedInAncestors(name, ancestors)
		)
			return false;
		const useStart = nodeStart(reference);
		const constants = new Map<string, unknown>();
		for (const [constantName, constant] of moduleConstants) {
			if (constant.declStart < useStart) constants.set(constantName, constant.value);
		}
		const value = evalLiteral(reference as never, constants, evaluateCall);
		return value !== undefined && (value === null || typeof value !== "object");
	};
	const assignmentTargets = (node: OxcNode | null | undefined, targets: Set<string>): void => {
		node = unwrapExpression(node);
		if (node === undefined) return;
		if (node.type === NodeKind.Identifier) {
			const name = (node as { name?: string }).name;
			if (name !== undefined) targets.add(name);
			return;
		}
		if (node.type === NodeKind.MemberExpression) {
			const name = rootName(node);
			if (name !== undefined) targets.add(name);
			return;
		}
		if (node.type === NodeKind.AssignmentPattern) {
			assignmentTargets((node as { left?: OxcNode }).left, targets);
			return;
		}
		if (node.type === NodeKind.RestElement) {
			assignmentTargets((node as { argument?: OxcNode }).argument, targets);
			return;
		}
		if (node.type === NodeKind.ArrayPattern) {
			for (const element of (node as { elements?: readonly (OxcNode | null)[] }).elements ?? [])
				assignmentTargets(element, targets);
			return;
		}
		if (node.type === NodeKind.ObjectPattern) {
			for (const property of (node as { properties?: readonly OxcNode[] }).properties ?? []) {
				if (property.type === NodeKind.RestElement)
					assignmentTargets((property as { argument?: OxcNode }).argument, targets);
				else assignmentTargets((property as { value?: OxcNode }).value, targets);
			}
		}
	};
	walkWithParent(program, (node, parent, ancestors) => {
		if (node.type === NodeKind.AssignmentExpression) {
			const targets = new Set<string>();
			assignmentTargets((node as { left?: OxcNode }).left, targets);
			for (const name of targets) if (candidates.has(name)) unsafe.add(name);
		}
		if (node.type === NodeKind.ForInStatement || node.type === NodeKind.ForOfStatement) {
			const left = (node as { left?: OxcNode }).left;
			if (left?.type !== NodeKind.VariableDeclaration) {
				const targets = new Set<string>();
				assignmentTargets(left, targets);
				for (const name of targets) if (candidates.has(name)) unsafe.add(name);
			}
		}
		if (
			node.type === NodeKind.UpdateExpression ||
			(node.type === NodeKind.UnaryExpression &&
				(node as { operator?: string }).operator === "delete")
		) {
			const name = rootName((node as { argument?: OxcNode }).argument);
			if (name !== undefined && candidates.has(name)) unsafe.add(name);
		}
		if (node.type !== NodeKind.Identifier || parent === undefined) return;
		const name = (node as { name?: string }).name;
		if (name === undefined || !candidates.has(name)) return;
		if (
			parent.type === NodeKind.VariableDeclarator &&
			(parent as VariableDeclaratorNode).id === node
		)
			return;
		if (
			parent.type === NodeKind.Property &&
			(parent as { key?: OxcNode; computed?: boolean; shorthand?: boolean }).key === node &&
			(parent as { computed?: boolean; shorthand?: boolean }).computed !== true &&
			(parent as { shorthand?: boolean }).shorthand !== true
		)
			return;
		let reference = node;
		let referenceParent = parent;
		let ancestorIndex = ancestors.length - 2;
		while (
			referenceParent.type === NodeKind.MemberExpression &&
			(referenceParent as { object?: OxcNode }).object === reference
		) {
			reference = referenceParent;
			const next = ancestors[ancestorIndex--];
			if (next === undefined) return;
			referenceParent = next;
		}
		if (referenceParent.type === NodeKind.MemberExpression) return;
		if (referenceParent.type === NodeKind.CallExpression) {
			const callee = (referenceParent as { callee?: OxcNode }).callee;
			const carrier = rootName(callee);
			if (
				reference !== callee &&
				carrier !== undefined &&
				styleNames.has(carrier) &&
				!bindingIsShadowedInAncestors(carrier, ancestors)
			)
				return;
			unsafe.add(name);
			return;
		}
		const enclosingCall = [...ancestors]
			.toReversed()
			.find((ancestor) => ancestor.type === NodeKind.CallExpression);
		const enclosingCarrier = rootName((enclosingCall as { callee?: OxcNode } | undefined)?.callee);
		if (
			enclosingCarrier !== undefined &&
			styleNames.has(enclosingCarrier) &&
			!bindingIsShadowedInAncestors(enclosingCarrier, ancestors)
		)
			return;
		const isStoredPropertyValue =
			referenceParent.type === NodeKind.Property &&
			(referenceParent as { value?: OxcNode }).value === reference;
		const isStoredArrayElement =
			referenceParent.type === NodeKind.ArrayExpression &&
			((referenceParent as { elements?: readonly (OxcNode | null)[] }).elements ?? []).includes(
				reference,
			);
		if (
			(isStoredPropertyValue || isStoredArrayElement) &&
			isKnownPrimitiveMemberRead(reference, name, ancestors)
		)
			return;
		unsafe.add(name);
	});
	return unsafe;
};

export type CssLiteralScopeResolver = (
	node: OxcNode,
	ancestors: readonly OxcNode[],
) => CssLiteralConstantScope;

export const createCssLiteralScopeResolver = (
	program: OxcNode,
	evaluateCall: LiteralCallEvaluator,
	styleNames: ReadonlySet<string> = new Set(),
): CssLiteralScopeResolver => {
	const moduleConstants = collectModuleConstants(program, evaluateCall);
	const unsafeObjects = collectUnsafeObjectBindings(
		program,
		styleNames,
		moduleConstants,
		evaluateCall,
	);
	for (const name of unsafeObjects) moduleConstants.delete(name);
	return (node, ancestors) => {
		const useStart = nodeStart(node);
		const scope = new CssLiteralConstantScope(moduleConstants, useStart, unsafeObjects);
		for (const ancestor of ancestors) {
			if (isFunction(ancestor)) {
				scope.pushLayer(functionScopeBindings(ancestor as FunctionNode));
				continue;
			}
			if (
				ancestor.type === NodeKind.BlockStatement ||
				ancestor.type === NodeKind.SwitchStatement ||
				ancestor.type === NodeKind.StaticBlock
			) {
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
