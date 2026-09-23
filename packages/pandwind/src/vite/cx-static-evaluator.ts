import type { Expression } from "oxc-parser";
import type { CxInput } from "../cx/index.ts";
import type { PandwindEngineContext } from "./engine-context.ts";
import type { OxcNode } from "../tw/literal.ts";
import { bindingIsShadowedOrWritten } from "./ast-walk.ts";
import { NodeKind, VariableDeclarationKindTag } from "../ast-node-kind.ts";

/**
 * Compile-time evaluator for the cx() folding pass.
 *
 * The evaluator is deliberately conservative: unknown values return a
 * sentinel instead of being guessed. That keeps a build-time rewrite
 * observationally equivalent to the runtime merge. The supported static
 * domain is strings, the cx() falsey values, arrays, constant concatenation,
 * logical/conditional expressions, and literal css() calls when a fold
 * context is supplied.
 */
export const CX_NOT_STATIC = Symbol("pandwind.cx-not-static");
const NOT_STATIC: typeof CX_NOT_STATIC = CX_NOT_STATIC;

const FoldSkeletonKindTag = {
	Leaf: "leaf",
	Conditional: "cond",
	And: "and",
} as const;

/** `undefined` must remain distinguishable from an expression we cannot fold. */
export type StaticEval = CxInput | true | typeof CX_NOT_STATIC;

/** A top-level constant whose value is safe to reuse at this source position. */
export interface KnownConstant {
	readonly value: StaticEval;
	readonly declStart: number;
}

export type ConstantScope = Map<string, KnownConstant>;

/**
 * Merge constants discovered in an imported module with local constants.
 * Local declarations win, while any local shadow/write removes the imported
 * value: the imported value is not necessarily the value runtime code reads.
 */
export const mergeImportedConstants = (
	program: OxcNode,
	local: ConstantScope,
	imported?: ConstantScope,
): ConstantScope => {
	if (imported === undefined || imported.size === 0) return local;
	const merged: ConstantScope = new Map();
	for (const [name, known] of imported) {
		if (!bindingIsShadowedOrWritten(program, name)) merged.set(name, known);
	}
	for (const [name, known] of local) merged.set(name, known);
	return merged;
};

export interface CxFoldContext {
	readonly cssNames: ReadonlySet<string>;
	readonly engine: PandwindEngineContext;
}

const isTruthy = (value: StaticEval): boolean =>
	value !== false && value !== null && value !== undefined && value !== "";

const nodes = function* (root: unknown): Generator<OxcNode> {
	const queue: unknown[] = [root];
	for (let index = 0; index < queue.length; index++) {
		const current = queue[index];
		if (Array.isArray(current)) queue.push(...current);
		else if (current !== null && typeof current === "object") {
			const node = current as OxcNode;
			if (typeof node.type === "string") yield node;
			queue.push(...Object.values(node));
		}
	}
};

interface Candidate {
	init: Expression;
	decl: OxcNode;
}

const topLevelCandidates = (program: OxcNode): Map<string, Candidate> => {
	const candidates = new Map<string, Candidate>();
	for (const statement of (program as { body?: OxcNode[] }).body ?? []) {
		if (
			(statement as { type?: string }).type !== NodeKind.VariableDeclaration ||
			(statement as { kind?: string }).kind !== VariableDeclarationKindTag.Const
		)
			continue;
		for (const declaration of (statement as { declarations?: OxcNode[] }).declarations ?? []) {
			const binding = (declaration as { id?: OxcNode }).id;
			const init = (declaration as { init?: Expression | null }).init;
			const name = (binding as { type?: string; name?: string } | undefined)?.name;
			if (
				(binding as { type?: string } | undefined)?.type !== NodeKind.Identifier ||
				init === undefined ||
				init === null ||
				name === undefined ||
				candidates.has(name)
			)
				continue;
			candidates.set(name, { init, decl: declaration });
		}
	}
	return candidates;
};

const collectRiskyBindings = (options: {
	readonly program: OxcNode;
	readonly candidates: ReadonlyMap<string, Candidate>;
}): ReadonlySet<string> => {
	const own = new Set([...options.candidates.values()].map(({ decl }) => decl));
	const names = new Set<string>();
	const addBindingName = (binding: OxcNode | null | undefined): void => {
		if (binding?.type !== NodeKind.Identifier) return;
		const name = (binding as { name?: string }).name;
		if (name !== undefined) names.add(name);
	};
	for (const node of nodes(options.program)) {
		switch (node.type) {
			case NodeKind.VariableDeclarator: {
				if (!own.has(node)) addBindingName((node as { id?: OxcNode }).id);
				break;
			}
			case NodeKind.FunctionDeclaration:
			case NodeKind.ClassDeclaration:
				addBindingName((node as { id?: OxcNode }).id);
				break;
			case NodeKind.ImportSpecifier: {
				addBindingName((node as { local?: OxcNode }).local);
				break;
			}
			case NodeKind.CatchClause: {
				addBindingName((node as { param?: OxcNode }).param);
				break;
			}
			case NodeKind.AssignmentExpression: {
				let target = (node as { left?: OxcNode }).left;
				while (target?.type === NodeKind.MemberExpression)
					target = (target as { object?: OxcNode }).object;
				addBindingName(target);
				break;
			}
			case NodeKind.UpdateExpression: {
				addBindingName((node as { argument?: OxcNode }).argument);
				break;
			}
		}
		if (
			node.type === NodeKind.FunctionDeclaration ||
			node.type === NodeKind.FunctionExpression ||
			node.type === NodeKind.ArrowFunctionExpression
		) {
			for (const parameter of (node as { params?: OxcNode[] }).params ?? []) {
				for (const inner of nodes(parameter)) addBindingName(inner);
			}
		}
	}
	return names;
};

export function collectModuleConstants(program: OxcNode, fold?: CxFoldContext): ConstantScope {
	// Resolve in source order so `const B = A + "-x"` can use an earlier A.
	// Forward references, cycles, shadowing, and writes remain dynamic.
	const scope: ConstantScope = new Map();
	const candidates = topLevelCandidates(program);
	const riskyBindings = collectRiskyBindings({ program, candidates });
	for (const [name, candidate] of candidates) {
		const value = evalStaticCx(candidate.init, fold, scope);
		if (value === NOT_STATIC || riskyBindings.has(name)) continue;
		scope.set(name, {
			value,
			declStart: (candidate.decl as { start?: number }).start ?? Number.POSITIVE_INFINITY,
		});
	}
	return scope;
}

const cssCall = (node: Expression, fold: CxFoldContext): boolean => {
	const call = node as unknown as { callee?: OxcNode | null };
	const callee = call.callee;
	if (callee?.type === NodeKind.Identifier)
		return fold.cssNames.has((callee as { name?: string }).name ?? "");
	if (callee?.type !== NodeKind.MemberExpression) return false;
	const object = (callee as { object?: OxcNode | null }).object;
	const property = (callee as { property?: { name?: string } | null }).property?.name;
	return (
		object?.type === NodeKind.Identifier &&
		fold.cssNames.has((object as { name?: string }).name ?? "") &&
		property === "class"
	);
};

export function evalStaticCx(
	node: Expression | undefined,
	fold?: CxFoldContext,
	consts?: ConstantScope,
): StaticEval {
	if (node === undefined) return NOT_STATIC;
	switch (node.type) {
		case NodeKind.Literal: {
			const value = (node as { value?: unknown }).value;
			return typeof value === "string" || value === false || value === null || value === true
				? (value as CxInput)
				: NOT_STATIC;
		}
		case NodeKind.Identifier: {
			const name = (node as { name?: string }).name;
			if (name === "undefined") return undefined;
			const known = consts?.get(name ?? "");
			// A use before the declaration would throw in the runtime TDZ; folding
			// it would silently change that observable behavior.
			return known !== undefined && typeof node.start === "number" && node.start >= known.declStart
				? known.value
				: NOT_STATIC;
		}
		case NodeKind.TemplateLiteral: {
			const expressions = (node as { expressions?: Expression[] }).expressions ?? [];
			const quasis =
				(node as { quasis?: Array<{ value: { cooked?: string; raw: string } }> }).quasis ?? [];
			let value = quasis[0]?.value.cooked ?? quasis[0]?.value.raw ?? "";
			for (let index = 0; index < expressions.length; index++) {
				const part = evalStaticCx(expressions[index], fold, consts);
				if (typeof part !== "string") return NOT_STATIC;
				value += part + (quasis[index + 1]?.value.cooked ?? quasis[index + 1]?.value.raw ?? "");
			}
			return value;
		}
		case NodeKind.BinaryExpression: {
			if ((node as { operator?: string }).operator !== "+") return NOT_STATIC;
			const left = evalStaticCx((node as { left: Expression }).left, fold, consts);
			const right = evalStaticCx((node as { right: Expression }).right, fold, consts);
			return typeof left === "string" && typeof right === "string" ? left + right : NOT_STATIC;
		}
		case NodeKind.ArrayExpression: {
			const values: StaticEval[] = [];
			for (const element of (node as { elements?: Expression[] }).elements ?? []) {
				if (element === null || (element as { type?: string }).type === NodeKind.SpreadElement)
					return NOT_STATIC;
				const value = evalStaticCx(element, fold, consts);
				if (value === NOT_STATIC) return NOT_STATIC;
				values.push(value);
			}
			return values as unknown as CxInput;
		}
		case NodeKind.LogicalExpression: {
			const left = evalStaticCx((node as { left: Expression }).left, fold, consts);
			if (left === NOT_STATIC) return NOT_STATIC;
			const right = () => evalStaticCx((node as { right: Expression }).right, fold, consts);
			switch ((node as { operator?: string }).operator) {
				case "&&":
					return isTruthy(left) ? right() : left;
				case "||":
					return isTruthy(left) ? left : right();
				case "??":
					return left !== null && left !== undefined ? left : right();
				default:
					return NOT_STATIC;
			}
		}
		case NodeKind.ConditionalExpression: {
			const test = evalStaticCx((node as { test: Expression }).test, fold, consts);
			if (test === NOT_STATIC) return NOT_STATIC;
			return isTruthy(test)
				? evalStaticCx((node as { consequent: Expression }).consequent, fold, consts)
				: evalStaticCx((node as { alternate: Expression }).alternate, fold, consts);
		}
		case NodeKind.CallExpression: {
			if (fold === undefined || !cssCall(node, fold)) return NOT_STATIC;
			const classes: string[] = [];
			for (const argument of (node as unknown as { arguments: Expression[] }).arguments) {
				const literal = evalLiteralForCx(argument, consts);
				if (
					literal === NOT_STATIC ||
					typeof literal !== "object" ||
					literal === null ||
					Array.isArray(literal)
				)
					return NOT_STATIC;
				const compiled = fold.engine.foldLiteralStyle(literal as Record<string, unknown>);
				if (compiled === null) return NOT_STATIC;
				classes.push(compiled);
			}
			return classes.join(" ");
		}
		default:
			return NOT_STATIC;
	}
}

const evalLiteralForCx = (node: Expression, consts?: ConstantScope): unknown => {
	const value = evalStaticCx(node, undefined, consts);
	if (value !== NOT_STATIC && (typeof value !== "object" || value === null || Array.isArray(value)))
		return value;
	if (node.type !== NodeKind.ObjectExpression) return NOT_STATIC;
	const result: Record<string, unknown> = {};
	for (const property of node.properties) {
		if (
			property.type !== NodeKind.Property ||
			property.computed ||
			property.method ||
			property.shorthand
		)
			return NOT_STATIC;
		const key =
			property.key.type === NodeKind.Identifier
				? property.key.name
				: property.key.type === NodeKind.Literal && typeof property.key.value === "string"
					? property.key.value
					: undefined;
		if (key === undefined) return NOT_STATIC;
		const propertyValue = evalLiteralForCx(property.value, consts);
		if (propertyValue === NOT_STATIC) return NOT_STATIC;
		result[key] = propertyValue;
	}
	return result;
};

export type FoldSkeleton =
	| { kind: "leaf"; value: StaticEval }
	| { kind: "cond"; testSource: string; consequent: FoldSkeleton; alternate: FoldSkeleton }
	| { kind: "and"; testSource: string; right: FoldSkeleton };

/**
 * A partial-fold decision tree keeps only the runtime test. Every branch is
 * fully merged with the static siblings ahead of time. `&&` is supported
 * because its false branch is the runtime cx() falsey value; `||` and `??`
 * are intentionally excluded because their fallback values change merge
 * semantics when precomputed.
 */
export function buildFoldSkeleton(
	node: Expression,
	consts: ConstantScope,
	code: string,
): FoldSkeleton | null {
	const value = evalStaticCx(node, undefined, consts);
	if (value !== NOT_STATIC) return { kind: "leaf", value };
	const type = (node as { type?: string }).type;
	if (type === "ConditionalExpression") {
		const consequent = buildFoldSkeleton(
			(node as { consequent: Expression }).consequent,
			consts,
			code,
		);
		const alternate = buildFoldSkeleton(
			(node as { alternate: Expression }).alternate,
			consts,
			code,
		);
		if (consequent === null || alternate === null) return null;
		return {
			kind: "cond",
			testSource: code.slice((node as { start: number }).start, (node as { end: number }).end),
			consequent,
			alternate,
		};
	}
	if (type === "LogicalExpression" && (node as { operator?: string }).operator === "&&") {
		const right = buildFoldSkeleton((node as { right: Expression }).right, consts, code);
		return right === null
			? null
			: {
					kind: "and",
					testSource: code.slice((node as { start: number }).start, (node as { end: number }).end),
					right,
				};
	}
	return null;
}

export const renderFoldSkeleton = (
	skeleton: FoldSkeleton,
	dynamicIndex: number,
	staticInputs: StaticEval[],
	merge: (inputs: CxInput[]) => string | undefined,
): string | null => {
	// Each leaf is merged through the same callback used for a full fold, so
	// partial folding cannot invent a different conflict-resolution result.
	const render = (current: FoldSkeleton): string | null => {
		if (current.kind === FoldSkeletonKindTag.Leaf) {
			const merged = merge(
				staticInputs.map((value, index) =>
					index === dynamicIndex ? current.value : value,
				) as CxInput[],
			);
			return merged === undefined ? null : JSON.stringify(merged);
		}
		if (current.kind === FoldSkeletonKindTag.Conditional) {
			const consequent = render(current.consequent);
			const alternate = render(current.alternate);
			return consequent === null || alternate === null
				? null
				: `((${current.testSource}) ? ${consequent} : ${alternate})`;
		}
		const truthy = render(current.right);
		const falsy = merge(
			staticInputs.map((value, index) => (index === dynamicIndex ? false : value)) as CxInput[],
		);
		return truthy === null || falsy === undefined
			? null
			: `((${current.testSource}) ? ${truthy} : ${JSON.stringify(falsy)})`;
	};
	return render(skeleton);
};
