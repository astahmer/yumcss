import { NodeKind, PropertyKindTag } from "../ast-node-kind.ts";

export { canonicalStyleKey } from "../css/style-key.ts";
export { isLiteralKeyframeBody } from "../css/keyframes.ts";
export { evalLiteral } from "../tw/literal.ts";
export { createFirstThatWorksEvaluator } from "./css-first-that-works.ts";
export { createCssLiteralScopeResolver } from "./css-literal-scope.ts";
export type { LiteralCallEvaluator, LiteralConstantScope, OxcNode } from "../tw/literal.ts";

export type InlineAstNode = {
	readonly type: string;
	readonly [key: string]: any;
};

const isNode = (value: unknown): value is InlineAstNode =>
	typeof value === "object" && value !== null && typeof (value as InlineAstNode).type === "string";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const safePathPart = (value: string): boolean =>
	value.length > 0 && !value.includes("__") && !value.includes("\u0000");

const propertyName = (node: InlineAstNode): string | undefined => {
	if (node.type !== NodeKind.Property) return undefined;
	const key = node.key;
	if (isNode(key) && key.type === NodeKind.Identifier && typeof key.name === "string")
		return key.name;
	if (isNode(key) && key.type === NodeKind.Literal && typeof key.value === "string")
		return key.value;
	return undefined;
};

const isStaticComputedKey = (node: InlineAstNode): boolean =>
	node.computed === true &&
	isNode(node.key) &&
	node.key.type === NodeKind.Literal &&
	typeof node.key.value === "string";

const appendPath = (prefix: string, name: string): string =>
	prefix === "" ? name : `${prefix}__${name}`;

export const CSS_INLINE_UNKNOWN = Symbol("pandwind.css-inline-unknown");

export const CssInlineResidualCode = Object.freeze({
	NonObject: "non-object-style",
	Spread: "dynamic-spread",
	PropertyShape: "unsupported-property-shape",
	ComputedKey: "computed-style-key",
	NestedArray: "nested-array",
	NestedFunction: "nested-function",
	DynamicFallback: "dynamic-fallback-helper",
	PathCollision: "style-path-collision",
} as const);

export type CssInlineResidualCode =
	(typeof CssInlineResidualCode)[keyof typeof CssInlineResidualCode];

export interface CssInlineResidual {
	readonly code: CssInlineResidualCode;
	readonly node: InlineAstNode | undefined;
}

export interface CssInlineEntry {
	readonly key: string;
	readonly valueNode: InlineAstNode | undefined;
	readonly value: unknown;
	readonly dynamic: boolean;
	readonly order: number;
	readonly argumentIndex: number;
}

export interface CssInlineArgumentAnalysis {
	readonly entries: readonly CssInlineEntry[];
	readonly staticWinners: readonly CssInlineEntry[];
	readonly dynamicWinners: readonly CssInlineEntry[];
	readonly evaluationEntries: readonly CssInlineEntry[];
}

export interface CssInlineAnalysis {
	readonly arguments: readonly CssInlineArgumentAnalysis[];
	readonly entries: readonly CssInlineEntry[];
	readonly staticWinners: readonly CssInlineEntry[];
	readonly dynamicWinners: readonly CssInlineEntry[];
	readonly evaluationEntries: readonly CssInlineEntry[];
	readonly residuals: readonly CssInlineResidual[];
}

export interface CssInlineAnalysisOptions {
	readonly evaluateStatic: (node: InlineAstNode) => unknown | typeof CSS_INLINE_UNKNOWN;
	readonly canonicalizeKey?: (key: string) => string;
	readonly forceDynamic?: boolean;
	readonly isStaticSpread?: (node: InlineAstNode) => boolean;
	readonly isDynamicFallback?: (node: InlineAstNode) => boolean;
}

const appendStaticObject = (
	value: Record<string, unknown>,
	prefix: string,
	argumentIndex: number,
	entries: CssInlineEntry[],
	order: { value: number },
): void => {
	for (const [name, child] of Object.entries(value)) {
		if (!safePathPart(name)) continue;
		const key = appendPath(prefix, name);
		if (isPlainObject(child)) {
			appendStaticObject(child, key, argumentIndex, entries, order);
			continue;
		}
		entries.push({
			key,
			valueNode: undefined,
			value: child,
			dynamic: false,
			order: order.value++,
			argumentIndex,
		});
	}
};

const analyzeObject = (
	node: InlineAstNode,
	prefix: string,
	argumentIndex: number,
	entries: CssInlineEntry[],
	residuals: CssInlineResidual[],
	options: CssInlineAnalysisOptions,
	order: { value: number },
): void => {
	if (node.type !== NodeKind.ObjectExpression) {
		residuals.push({ code: CssInlineResidualCode.NonObject, node });
		return;
	}
	for (const property of (node.properties as unknown[] | undefined) ?? []) {
		if (!isNode(property)) {
			residuals.push({ code: CssInlineResidualCode.PropertyShape, node: undefined });
			continue;
		}
		if (property.type === NodeKind.SpreadElement) {
			const spreadValue = isNode(property.argument)
				? options.evaluateStatic(property.argument)
				: CSS_INLINE_UNKNOWN;
			const staticSpread =
				isNode(property.argument) && options.isStaticSpread?.(property.argument) === true;
			if (staticSpread && (spreadValue === CSS_INLINE_UNKNOWN || !isPlainObject(spreadValue)))
				continue;
			if (!isPlainObject(spreadValue)) {
				residuals.push({ code: CssInlineResidualCode.Spread, node: property });
				continue;
			}
			appendStaticObject(spreadValue, prefix, argumentIndex, entries, order);
			continue;
		}
		if (
			property.type !== NodeKind.Property ||
			property.kind !== PropertyKindTag.Init ||
			(property.computed === true && !isStaticComputedKey(property)) ||
			property.method === true
		) {
			residuals.push({ code: CssInlineResidualCode.PropertyShape, node: property });
			continue;
		}
		const name = propertyName(property);
		const valueNode = isNode(property.value) ? property.value : undefined;
		if (name === undefined || valueNode === undefined || !safePathPart(name)) {
			residuals.push({ code: CssInlineResidualCode.ComputedKey, node: property });
			continue;
		}
		const key = appendPath(prefix, name);
		if (name === "$raw") {
			if (valueNode.type === NodeKind.ObjectExpression) {
				analyzeObject(valueNode, prefix, argumentIndex, entries, residuals, options, order);
				continue;
			}
			if (!options.forceDynamic) {
				const staticRaw = options.evaluateStatic(valueNode);
				if (staticRaw !== CSS_INLINE_UNKNOWN && isPlainObject(staticRaw)) {
					appendStaticObject(staticRaw, prefix, argumentIndex, entries, order);
					continue;
				}
			}
			residuals.push({ code: CssInlineResidualCode.PropertyShape, node: property });
			continue;
		}
		if (name.startsWith("$")) {
			residuals.push({ code: CssInlineResidualCode.PropertyShape, node: property });
			continue;
		}
		if (valueNode.type === NodeKind.ObjectExpression) {
			analyzeObject(valueNode, key, argumentIndex, entries, residuals, options, order);
			continue;
		}
		if (valueNode.type === NodeKind.ArrayExpression) {
			residuals.push({ code: CssInlineResidualCode.NestedArray, node: valueNode });
			continue;
		}
		if (
			valueNode.type === NodeKind.ArrowFunctionExpression ||
			valueNode.type === NodeKind.FunctionExpression
		) {
			residuals.push({ code: CssInlineResidualCode.NestedFunction, node: valueNode });
			continue;
		}
		const staticValue = options.forceDynamic
			? CSS_INLINE_UNKNOWN
			: options.evaluateStatic(valueNode);
		const dynamic = staticValue === CSS_INLINE_UNKNOWN;
		if (dynamic && options.isDynamicFallback?.(valueNode) === true) {
			residuals.push({ code: CssInlineResidualCode.DynamicFallback, node: valueNode });
		}
		entries.push({
			key,
			valueNode,
			value: dynamic ? undefined : staticValue,
			dynamic,
			order: order.value++,
			argumentIndex,
		});
	}
};

const hasPrefixCollision = (left: string, right: string): boolean =>
	left !== right && (left.startsWith(`${right}__`) || right.startsWith(`${left}__`));

const winners = (entries: readonly CssInlineEntry[]): Map<string, CssInlineEntry> => {
	const result = new Map<string, CssInlineEntry>();
	for (const entry of entries) result.set(entry.key, entry);
	return result;
};

export const analyzeCssInlineArguments = (
	argumentsList: readonly unknown[],
	options: CssInlineAnalysisOptions,
): CssInlineAnalysis => {
	const residuals: CssInlineResidual[] = [];
	const entries: CssInlineEntry[] = [];
	for (const [argumentIndex, argument] of argumentsList.entries()) {
		analyzeObject(
			isNode(argument) ? argument : { type: "" },
			"",
			argumentIndex,
			entries,
			residuals,
			options,
			{ value: entries.length },
		);
	}
	const lastByKey = winners(entries);
	const keys = [...lastByKey.keys()];
	for (let index = 0; index < keys.length; index += 1) {
		for (let otherIndex = index + 1; otherIndex < keys.length; otherIndex += 1) {
			if (!hasPrefixCollision(keys[index]!, keys[otherIndex]!)) continue;
			const entry = lastByKey.get(keys[index]!);
			residuals.push({ code: CssInlineResidualCode.PathCollision, node: entry?.valueNode });
		}
	}
	const canonicalizeKey = options.canonicalizeKey ?? ((key: string) => key);
	const canonicalEntries = entries.map((entry) => ({
		...entry,
		key: canonicalizeKey(entry.key),
	}));
	const canonicalLastByKey = winners(canonicalEntries);
	const canonicalKeys = [...canonicalLastByKey.keys()];
	for (let index = 0; index < canonicalKeys.length; index += 1) {
		for (let otherIndex = index + 1; otherIndex < canonicalKeys.length; otherIndex += 1) {
			if (!hasPrefixCollision(canonicalKeys[index]!, canonicalKeys[otherIndex]!)) continue;
			const entry = canonicalLastByKey.get(canonicalKeys[index]!);
			residuals.push({ code: CssInlineResidualCode.PathCollision, node: entry?.valueNode });
		}
	}
	const dedupedResiduals = residuals.filter(
		(residual, index) =>
			residuals.findIndex(
				(candidate) => candidate.code === residual.code && candidate.node === residual.node,
			) === index,
	);
	const canonicalEntriesByArgument = new Map<number, CssInlineEntry[]>();
	for (const entry of canonicalEntries) {
		const current = canonicalEntriesByArgument.get(entry.argumentIndex) ?? [];
		current.push(entry);
		canonicalEntriesByArgument.set(entry.argumentIndex, current);
	}
	const argumentAnalyses = argumentsList.map((_, argumentIndex) => {
		const argumentEntries = canonicalEntriesByArgument.get(argumentIndex) ?? [];
		const argumentWinners = new Set(
			argumentEntries.filter((entry) => canonicalLastByKey.get(entry.key) === entry),
		);
		return {
			entries: argumentEntries,
			staticWinners: argumentEntries.filter(
				(entry) => !entry.dynamic && argumentWinners.has(entry),
			),
			dynamicWinners: argumentEntries.filter(
				(entry) => entry.dynamic && argumentWinners.has(entry),
			),
			evaluationEntries: argumentEntries.filter((entry) => entry.dynamic),
		};
	});
	const staticWinners = canonicalEntries.filter(
		(entry) => !entry.dynamic && canonicalLastByKey.get(entry.key) === entry,
	);
	const dynamicWinners = canonicalEntries.filter(
		(entry) => entry.dynamic && canonicalLastByKey.get(entry.key) === entry,
	);
	return {
		arguments: argumentAnalyses,
		entries: canonicalEntries,
		staticWinners,
		dynamicWinners,
		evaluationEntries: canonicalEntries.filter((entry) => entry.dynamic),
		residuals: dedupedResiduals,
	};
};

const containsCall = (node: InlineAstNode, names: ReadonlySet<string>): boolean => {
	let found = false;
	const stack: unknown[] = [node];
	while (stack.length > 0) {
		const current = stack.pop();
		if (Array.isArray(current)) {
			for (let index = current.length - 1; index >= 0; index -= 1) stack.push(current[index]);
			continue;
		}
		if (!isNode(current)) continue;
		if (current.type === NodeKind.CallExpression) {
			const callee = current.callee;
			if (isNode(callee) && callee.type === NodeKind.Identifier && names.has(String(callee.name))) {
				found = true;
				break;
			}
		}
		for (const [key, value] of Object.entries(current))
			if (key !== "type" && key !== "parent") stack.push(value);
	}
	return found;
};

export const findCssFallbackValueNames = (
	program: InlineAstNode,
	callNames: ReadonlySet<string>,
): ReadonlySet<string> => {
	const declarations: Array<{ name: string; init: InlineAstNode }> = [];
	const stack: unknown[] = [program];
	while (stack.length > 0) {
		const current = stack.pop();
		if (Array.isArray(current)) {
			for (let index = current.length - 1; index >= 0; index -= 1) stack.push(current[index]);
			continue;
		}
		if (!isNode(current)) continue;
		if (current.type === NodeKind.VariableDeclarator) {
			const id = current.id;
			if (
				isNode(id) &&
				id.type === NodeKind.Identifier &&
				typeof id.name === "string" &&
				isNode(current.init)
			)
				declarations.push({ name: id.name, init: current.init });
		}
		for (const [key, value] of Object.entries(current))
			if (key !== "type" && key !== "parent") stack.push(value);
	}
	const values = new Set<string>();
	let changed = true;
	while (changed) {
		changed = false;
		for (const declaration of declarations) {
			if (
				values.has(declaration.name) ||
				(!containsCall(declaration.init, callNames) &&
					!(
						declaration.init.type === NodeKind.Identifier &&
						values.has(String(declaration.init.name))
					))
			)
				continue;
			values.add(declaration.name);
			changed = true;
		}
	}
	return values;
};
