/**
 * yumcss static-extraction discipline rules (TypeScript source for the Oxlint JS plugin).
 *
 * The plugin enforces source-level constraints and uses compiler-owned static
 * resolvers when it can prove a project's preset values. Dynamic project
 * configuration, external ecosystem loaders, CSS generation, and browser
 * proofs belong to the adapter and validator layers.
 *
 * Rules:
 * - no-spreads: spread arguments that cannot be statically folded
 * - no-dynamic-values: compiler-backed runtime-only argument shapes
 * - no-multiple-conditionals: multiple compiler-foldable cx() arguments
 * - no-redundant-cx: a single static class token passed through unchanged
 * - no-dollar-raw: explicit escape hatches from the token lane
 * - no-arbitrary-values: arbitrary class values in static lanes
 * - design-tokens-only: verified project token policy violations
 * - migration-skip-reason: migration skip markers must explain themselves
 * - no-stale-migration-skip: static calls must not retain stale skip markers
 * - require-migration-residual: dynamic static-lane calls need a marker
 * - no-conflicting-style-props: css.props() must not compete with host props
 * - prefer-css-props-spread: preserve all css.props() output on JSX hosts
 * - no-dynamic-carrier-fallback: dynamic host carriers that cannot be lowered directly
 * - no-dynamic-keyframes: keyframe bodies must be statically extractable
 * - no-raw-ast-identities: parser node discriminants must use an owned table
 */

import { NodeKind } from "./ast-node-kind.ts";
import {
	createProjectTokenVocabularyResolver,
	styleBindingPathForCall,
} from "./project-token-vocabulary.ts";
import { cssPropertiesMayConflict, isTypedCssStringValue } from "./typed-css-values.ts";
import type { PresetTokenVocabulary } from "yumcss/vite/preset-context";
import {
	analyzeCssInlineArguments,
	canonicalStyleKey,
	CSS_INLINE_UNKNOWN,
	CssInlineResidualCode,
	createCssLiteralScopeResolver,
	createFirstThatWorksEvaluator,
	evalLiteral,
	findCssFallbackValueNames,
	isLiteralKeyframeBody,
} from "yumcss/vite/css-inline-analysis";
import {
	collectModuleConstants,
	defaultCxCompilerPorts,
	evalStaticCx,
} from "yumcss/vite/cx-inline";
import { evalLiteral as evalTwLiteral } from "yumcss/tw/literal";

const CX_NOT_STATIC_VALUE = evalStaticCx(undefined);

const SOURCE = Object.freeze({
	core: "yumcss",
	css: "yumcss/css",
	unsafeCss: "yumcss/unsafe/css",
	design: "yumcss/design",
});

const API = Object.freeze({
	cx: "cx",
	tw: "tw",
	cssFactory: "createCss",
	unsafeCssFactory: "createUnsafeCss",
	designFactory: "createDesignCss",
	style: "style",
});

const STYLE_METHOD = Object.freeze({
	class: "class",
	vars: "vars",
	props: "props",
	group: "group",
	input: "input",
	raw: "raw",
	keyframes: "keyframes",
});

const CORE_APIS = new Set<string>([API.cx, API.tw]);
const STYLE_METHODS = new Set<string>([
	STYLE_METHOD.class,
	STYLE_METHOD.vars,
	STYLE_METHOD.props,
	STYLE_METHOD.group,
	STYLE_METHOD.input,
	STYLE_METHOD.raw,
	STYLE_METHOD.keyframes,
]);
const RUNTIME_STYLE_METHODS = new Set<string>([
	STYLE_METHOD.vars,
	STYLE_METHOD.props,
	STYLE_METHOD.group,
	STYLE_METHOD.input,
	STYLE_METHOD.raw,
]);
const DESIGN_MODULE_KEYS = new Set(["$frame", "$layout", "$text"]);
const MIGRATION_MARKER = "yumcss:migrate-skip";
const AST_IDENTITY_VALUES = new Set(Object.values(NodeKind));

type AstNode = { type: string; [key: string]: any };
type AstValue = AstNode | AstValue[] | null | undefined | string | number | boolean;
type AstVisitor = (node: AstNode) => void;
type ApiReference = { kind: string; name: string; method?: string; factory?: string };
type SourceComment = {
	type: string;
	value: string;
	start?: number;
	end?: number;
};
type RuleContext = {
	readonly cwd?: string;
	readonly filename?: string;
	readonly physicalFilename?: string;
	readonly options?: readonly unknown[];
	readonly settings?: Readonly<Record<string, unknown>>;
	readonly sourceCode?: {
		readonly text: string;
		readonly getAllComments?: () => readonly SourceComment[];
	};
	report(payload: {
		node?: AstNode;
		message: string;
		data?: Record<string, string | number>;
		fix?: (fixer: RuleFixer) => unknown;
	}): void;
};
type RuleFixer = {
	insertTextBefore(node: AstNode, text: string): unknown;
	removeRange(range: readonly [number, number]): unknown;
	replaceTextRange(range: readonly [number, number], text: string): unknown;
};
type RuleListener = {
	Program?: (node: AstNode) => void;
	CallExpression?: (node: AstNode) => void;
};
type RuleDefinition = {
	create(context: RuleContext): RuleListener;
	meta?: { fixable?: "code" | "whitespace"; schema?: readonly unknown[] };
};
/** Type-only import discriminators (`importKind`). */
const IMPORT_KIND = { type: "type" } as const;

const isNode = (value: unknown): value is AstNode =>
	value !== null && typeof value === "object" && "type" in value && typeof value.type === "string";

/**
 * Explicit depth-first traversal avoids call-stack exhaustion for generated
 * or user-authored ASTs. The reverse push preserves source order.
 */
const walkNode = (root: AstValue, visit: AstVisitor): void => {
	const stack: AstValue[] = Array.isArray(root) ? root.toReversed() : [root];
	while (stack.length > 0) {
		const node = stack.pop();
		if (Array.isArray(node)) {
			for (let index = node.length - 1; index >= 0; index -= 1) stack.push(node[index]);
			continue;
		}
		if (!isNode(node)) continue;
		visit(node);
		const keys = Object.keys(node);
		for (let index = keys.length - 1; index >= 0; index -= 1) {
			const key = keys[index];
			if (key === undefined) continue;
			if (key !== "parent" && key !== "type") stack.push(node[key]);
		}
	}
};

const isAstIdentityLiteral = (node: AstNode | undefined): boolean =>
	node?.type === NodeKind.Literal &&
	typeof node.value === "string" &&
	AST_IDENTITY_VALUES.has(node.value as (typeof NodeKind)[keyof typeof NodeKind]);

const memberPropertyName = (node: AstNode | undefined): string | undefined => {
	if (node?.type !== NodeKind.MemberExpression) return undefined;
	if (!node.computed && node.property?.type === NodeKind.Identifier) return node.property.name;
	if (node.computed && node.property?.type === NodeKind.Literal)
		return typeof node.property.value === "string" ? node.property.value : undefined;
	return undefined;
};

const rawAstIdentityNode = (node: AstNode): AstNode | undefined => {
	if (node.type !== NodeKind.BinaryExpression) return undefined;
	if (!["===", "!==", "==", "!="].includes(node.operator)) return undefined;
	const sides = [node.left, node.right] as AstNode[];
	const member = sides.find((side) => memberPropertyName(side) === "type");
	const literal = sides.find((side) => isAstIdentityLiteral(side));
	return member !== undefined && literal !== undefined ? literal : undefined;
};

const propertyName = (property: AstNode): string | undefined => {
	if (property.type !== NodeKind.Property) return undefined;
	const key = property.key;
	if (key?.type === NodeKind.Identifier) return key.name;
	if (key?.type === NodeKind.Literal) return String(key.value);
	return undefined;
};

const memberName = (member: AstNode): string | undefined => {
	if (member.type !== NodeKind.MemberExpression) return undefined;
	if (!member.computed && member.property?.type === NodeKind.Identifier)
		return member.property.name;
	if (member.computed && member.property?.type === NodeKind.Literal)
		return String(member.property.value);
	return undefined;
};

const sourceName = (source: AstNode | undefined): string | undefined =>
	source?.type === NodeKind.Literal && typeof source.value === "string" ? source.value : undefined;

const importedName = (specifier: AstNode): string | undefined => {
	if (specifier.type !== NodeKind.ImportSpecifier) return undefined;
	if (specifier.imported?.type === NodeKind.Identifier) return specifier.imported.name;
	if (specifier.imported?.type === NodeKind.Literal) return String(specifier.imported.value);
	return undefined;
};

const apiFromImport = (
	source: string | undefined,
	imported: string | undefined,
): string | undefined => {
	if (source === SOURCE.core && imported !== undefined && CORE_APIS.has(imported)) return imported;
	if (source === SOURCE.css && imported === API.cssFactory) return API.cssFactory;
	if (source === SOURCE.unsafeCss && imported === API.unsafeCssFactory) return API.unsafeCssFactory;
	if (source === SOURCE.design && imported === API.designFactory) return API.designFactory;
	return undefined;
};

const conventionalStyleModuleFactory = (source: string): string | undefined => {
	const match = /^(?:\.\/|\.\.\/)+(css|design)(?:\.[cm]?[jt]sx?)?$/u.exec(
		source.replace(/\\/gu, "/"),
	);
	if (match?.[1] === "css") return API.cssFactory;
	if (match?.[1] === "design") return API.designFactory;
	return undefined;
};

const isConventionalStyleInstance = (factory: string, imported: string): boolean => {
	if (factory === API.cssFactory)
		return imported === "css" || (imported.endsWith("Css") && !imported.startsWith("create"));
	if (factory === API.designFactory)
		return imported === "dss" || (imported.endsWith("Dss") && !imported.startsWith("create"));
	return false;
};

type DynamicExpression = { node: AstNode; bad: string };

/**
 * Locate the dynamic expression after the owning compiler evaluator rejects
 * the argument. Generated style objects can be much deeper than authored code,
 * so the diagnostic walk is iterative.
 */
const findDynamicExpression = (options: {
	readonly root: AstValue;
	readonly staticBindings: Pick<ReadonlySet<string>, "has">;
	readonly resolveCall?: (call: AstNode) => ApiReference | undefined;
	readonly inspectConditionalTests?: boolean;
}): DynamicExpression | undefined => {
	const stack: AstValue[] = [options.root];
	const seen = new Set<AstNode>();
	while (stack.length > 0) {
		const value = stack.pop();
		if (Array.isArray(value)) {
			for (let index = value.length - 1; index >= 0; index -= 1) stack.push(value[index]);
			continue;
		}
		if (!isNode(value) || seen.has(value)) continue;
		seen.add(value);

		switch (value.type) {
			case NodeKind.Literal:
				continue;
			case NodeKind.Identifier:
				if (value.name === "undefined" || options.staticBindings.has(value.name)) continue;
				return { node: value, bad: "unresolved identifier" };
			case NodeKind.MemberExpression:
				return { node: value, bad: "member expression value" };
			case NodeKind.TemplateLiteral:
				if ((value.expressions?.length ?? 0) > 0)
					return { node: value, bad: "template interpolation" };
				continue;
			case NodeKind.ArrowFunctionExpression:
			case NodeKind.FunctionExpression:
			case NodeKind.FunctionDeclaration:
				return { node: value, bad: "function argument" };
			case NodeKind.CallExpression: {
				const api = options.resolveCall?.(value);
				if ((api?.kind === API.tw || api?.kind === API.style) && isExtractionLane(api)) {
					for (const argument of value.arguments ?? []) stack.push(argument);
					continue;
				}
				return { node: value, bad: "dynamic helper call" };
			}
			case NodeKind.NewExpression:
			case NodeKind.TaggedTemplateExpression:
				return { node: value, bad: "dynamic helper call" };
			case NodeKind.SpreadElement:
				if (
					(value.argument?.type === NodeKind.Identifier &&
						options.staticBindings.has(value.argument.name)) ||
					value.argument?.type === NodeKind.ObjectExpression ||
					value.argument?.type === NodeKind.ArrayExpression
				) {
					stack.push(value.argument);
					continue;
				}
				return { node: value, bad: "spread argument" };
			case NodeKind.Property:
				if (value.computed) stack.push(value.key);
				stack.push(value.value);
				continue;
			case NodeKind.ObjectExpression:
			case NodeKind.ArrayExpression:
				for (const child of value.properties ?? value.elements ?? []) stack.push(child);
				continue;
			case NodeKind.ConditionalExpression:
				if (options.inspectConditionalTests) stack.push(value.test);
				stack.push(value.alternate, value.consequent);
				continue;
			case NodeKind.LogicalExpression:
				stack.push(value.right, value.left);
				continue;
			case NodeKind.UnaryExpression:
			case NodeKind.AwaitExpression:
			case NodeKind.TSAsExpression:
			case NodeKind.TSTypeAssertion:
			case NodeKind.TypeCastExpression:
			case NodeKind.ChainExpression:
			case NodeKind.ParenthesizedExpression:
				stack.push(value.argument ?? value.expression);
				continue;
			case NodeKind.JSXExpressionContainer:
				stack.push(value.expression);
				continue;
			case NodeKind.Program:
			case NodeKind.ExpressionStatement:
				stack.push(value.expression ?? value.body);
				continue;
			default:
				continue;
		}
	}
	return undefined;
};
/**
 * Resolve package APIs and local CSS/design facades by their import sources.
 * Unrelated local functions remain outside this identity map.
 */
type ApiResolver = {
	readonly resolve: (call: AstNode) => ApiReference | undefined;
	readonly staticBindings: Pick<ReadonlySet<string>, "has">;
};

type ApiResolverOptions = {
	readonly includeUnconfiguredStyleFacades?: boolean;
};

const apiResolverCache = new WeakMap<AstNode, Map<string, ApiResolver>>();

const cssModuleExportsCacheKey = (cssModuleExports: CssModuleExports): string =>
	JSON.stringify(
		[...cssModuleExports.entries()]
			.toSorted(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
			.map(([source, exports]) => [source, [...exports].toSorted()]),
	);

const createApiResolver = (
	program: AstNode,
	cssModuleExports: CssModuleExports = new Map(),
	options: ApiResolverOptions = {},
): ApiResolver => {
	const includeUnconfiguredStyleFacades = options.includeUnconfiguredStyleFacades ?? true;
	const cacheKey = JSON.stringify([
		cssModuleExportsCacheKey(cssModuleExports),
		includeUnconfiguredStyleFacades,
	]);
	const cached = apiResolverCache.get(program)?.get(cacheKey);
	if (cached !== undefined) return cached;

	const direct = new Map<string, string>();
	const namespaces = new Map<string, string>();
	const localNamespaces = new Map<string, string>();
	const factories = new Map<string, string>();
	const instances = new Map<string, string>();
	const staticBindings = new Set<string>();
	const shadowedCalls = new WeakSet<AstNode>();

	const registerImport = (node: AstNode): void => {
		if (node.importKind === IMPORT_KIND.type) return;
		const source = sourceName(node.source);
		if (source === undefined) return;
		const configuredCssExports = cssModuleExports.get(source);
		const isYumCSSSource =
			source === SOURCE.core ||
			source === SOURCE.css ||
			source === SOURCE.unsafeCss ||
			source === SOURCE.design;
		const localFactory =
			isYumCSSSource || !includeUnconfiguredStyleFacades
				? undefined
				: conventionalStyleModuleFactory(source);
		if (!isYumCSSSource && configuredCssExports === undefined && localFactory === undefined) return;
		for (const specifier of node.specifiers ?? []) {
			if (specifier.importKind === IMPORT_KIND.type) continue;
			if (specifier.type === NodeKind.ImportNamespaceSpecifier) {
				namespaces.set(specifier.local.name, source);
				if (localFactory !== undefined) localNamespaces.set(specifier.local.name, localFactory);
				continue;
			}
			const imported = importedName(specifier);
			const api = apiFromImport(source, imported);
			if (api === API.cssFactory || api === API.unsafeCssFactory || api === API.designFactory)
				factories.set(specifier.local.name, api);
			else if (imported !== undefined && configuredCssExports?.has(imported))
				instances.set(specifier.local.name, API.cssFactory);
			else if (
				imported !== undefined &&
				localFactory !== undefined &&
				isConventionalStyleInstance(localFactory, imported)
			)
				instances.set(specifier.local.name, localFactory);
			else if (api !== undefined) direct.set(specifier.local.name, api);
		}
	};

	const resolveMember = (expression: unknown): string | undefined => {
		if (!isNode(expression) || expression.type !== NodeKind.MemberExpression) return undefined;
		const property = memberName(expression);
		if (property === undefined) return undefined;
		if (expression.object?.type === NodeKind.Identifier) {
			const object = expression.object.name;
			const namespace = namespaces.get(object);
			if (namespace !== undefined) {
				const api = apiFromImport(namespace, property);
				if (api !== undefined) return api;
				if (localNamespaces.has(object)) return API.style;
			}
			if (instances.has(object) && STYLE_METHODS.has(property)) return API.style;
		}
		if (
			expression.object?.type === NodeKind.MemberExpression &&
			expression.object.object?.type === NodeKind.Identifier &&
			localNamespaces.has(expression.object.object.name) &&
			STYLE_METHODS.has(property)
		)
			return API.style;
		return undefined;
	};

	const resolveFactory = (expression: unknown): string | undefined => {
		if (!isNode(expression) || expression.type !== NodeKind.CallExpression) return undefined;
		if (expression.callee?.type === NodeKind.Identifier)
			return factories.get(expression.callee.name);
		return resolveMember(expression.callee);
	};

	const scan = (sourceProgram: AstNode): void => {
		walkNode(sourceProgram, (node) => {
			if (node.type === NodeKind.ImportDeclaration) registerImport(node);
		});
		walkNode(sourceProgram, (node) => {
			if (node.type !== NodeKind.VariableDeclarator || node.id?.type !== NodeKind.Identifier)
				return;
			const factory = resolveFactory(node.init);
			if (
				factory === API.cssFactory ||
				factory === API.unsafeCssFactory ||
				factory === API.designFactory
			)
				instances.set(node.id.name, factory);
		});
		for (const name of compilerStaticAnalysisForProgram(sourceProgram).cxConstants.keys())
			staticBindings.add(name);

		const scopedStack: Array<{ value: AstValue; shadowed: ReadonlySet<string> }> = [
			{ value: sourceProgram, shadowed: new Set() },
		];
		while (scopedStack.length > 0) {
			const current = scopedStack.pop();
			if (current === undefined) continue;
			const value = current.value;
			if (Array.isArray(value)) {
				for (let index = value.length - 1; index >= 0; index -= 1)
					scopedStack.push({ value: value[index], shadowed: current.shadowed });
				continue;
			}
			if (!isNode(value)) continue;

			if (value.type === NodeKind.CallExpression) {
				const callee = value.callee;
				const name =
					callee?.type === NodeKind.Identifier
						? callee.name
						: callee?.type === NodeKind.MemberExpression &&
							  callee.object?.type === NodeKind.Identifier
							? callee.object.name
							: undefined;
				if (name !== undefined && current.shadowed.has(name)) shadowedCalls.add(value);
			}

			if (
				value.type === NodeKind.FunctionDeclaration ||
				value.type === NodeKind.FunctionExpression ||
				value.type === NodeKind.ArrowFunctionExpression
			) {
				const shadowed = new Set(current.shadowed);
				for (const parameter of value.params ?? []) {
					const patternStack: AstValue[] = [parameter];
					while (patternStack.length > 0) {
						const pattern = patternStack.pop();
						if (!isNode(pattern)) continue;
						if (pattern.type === NodeKind.Identifier) shadowed.add(pattern.name);
						for (const key of Object.keys(pattern)) {
							if (key !== "parent" && key !== "type") patternStack.push(pattern[key]);
						}
					}
				}
				scopedStack.push({ value: value.body, shadowed });
				continue;
			}

			const keys = Object.keys(value);
			for (let index = keys.length - 1; index >= 0; index -= 1) {
				const key = keys[index];
				if (key !== undefined && key !== "parent" && key !== "type")
					scopedStack.push({ value: value[key], shadowed: current.shadowed });
			}
		}
	};

	const resolve = (call: AstNode): ApiReference | undefined => {
		if (call.type !== NodeKind.CallExpression) return undefined;
		if (shadowedCalls.has(call)) return undefined;
		if (call.callee?.type === NodeKind.Identifier) {
			const kind = direct.get(call.callee.name);
			if (kind !== undefined) return { kind, name: call.callee.name };
			const factory = instances.get(call.callee.name);
			if (factory !== undefined) return { kind: API.style, name: call.callee.name, factory };
			return undefined;
		}
		const kind = resolveMember(call.callee);
		if (kind === undefined) return undefined;
		const method = memberName(call.callee);
		const calleeObject = call.callee.object;
		const objectName =
			calleeObject?.type === NodeKind.Identifier
				? calleeObject.name
				: calleeObject?.type === NodeKind.MemberExpression &&
					  calleeObject.object?.type === NodeKind.Identifier
					? calleeObject.object.name + "." + memberName(calleeObject)
					: undefined;
		if (objectName === undefined || method === undefined) return undefined;
		const factory =
			calleeObject?.type === NodeKind.Identifier
				? (instances.get(calleeObject.name) ?? localNamespaces.get(calleeObject.name))
				: calleeObject?.type === NodeKind.MemberExpression &&
					  calleeObject.object?.type === NodeKind.Identifier
					? localNamespaces.get(calleeObject.object.name)
					: undefined;
		return {
			kind,
			name: objectName + "." + method,
			...(factory !== undefined ? { method, factory } : {}),
		};
	};

	scan(program);
	const resolver: ApiResolver = { resolve, staticBindings };
	const resolvers = apiResolverCache.get(program) ?? new Map<string, ApiResolver>();
	resolvers.set(cacheKey, resolver);
	apiResolverCache.set(program, resolvers);
	return resolver;
};

/** Arbitrary-value class token: `w-[13px]`, `[margin-top:7px]`. */
const ARBITRARY_RE = /\[[^\]\s]+\]/;

/**
 * Walk one design module's values without recursing. `$raw` is an explicit
 * escape hatch and conditional branches stay opaque to avoid false positives.
 */
const walkDesignValues = (root: AstValue, seen: Set<AstNode>, report: AstVisitor): void => {
	const stack: AstValue[] = [root];
	while (stack.length > 0) {
		const node = stack.pop();
		if (Array.isArray(node)) {
			for (let index = node.length - 1; index >= 0; index -= 1) stack.push(node[index]);
			continue;
		}
		if (!isNode(node)) continue;
		if (node.type === NodeKind.Property && propertyName(node) === "$raw") continue;
		if (node.type === NodeKind.Literal && typeof node.value === "string") {
			if (!seen.has(node)) {
				seen.add(node);
				report(node);
			}
			continue;
		}
		if (node.type === NodeKind.ConditionalExpression || node.type === NodeKind.LogicalExpression)
			continue;
		const keys = Object.keys(node);
		for (let index = keys.length - 1; index >= 0; index -= 1) {
			const key = keys[index];
			if (key === undefined) continue;
			if (key !== "parent" && key !== "type") stack.push(node[key]);
		}
	}
};

/**
 * Structural mirror of the shared governance `TokenPolicySnapshot` (plans/054).
 * Declared locally because this governance contract is versioned and additive,
 * so structural compatibility is sufficient. The carrier rule imports the
 * shared YumCSS analyzer separately; governance still stays synchronous and
 * does not load arbitrary project packages. Unknown strictness (resolved:
 * false) stays report-only/fail-open.
 */
type TokenPolicySnapshotOption = {
	readonly owner: string;
	readonly resolved: boolean;
	readonly allowedRawValues?: readonly string[];
	readonly allowedRawPrefixes?: readonly string[];
	readonly strictProperties?: readonly string[];
	readonly allowedRawValuesByProperty?: Readonly<Record<string, readonly string[]>>;
	readonly tokenVocabulary?: Readonly<Record<string, Readonly<Record<string, string>>>>;
};

const governancePolicy = (context: RuleContext): TokenPolicySnapshotOption | undefined => {
	const options = context.options?.[0];
	const optionPolicy =
		options !== null && typeof options === "object" && !Array.isArray(options)
			? (options as Record<string, unknown>)["policy"]
			: undefined;
	if (optionPolicy !== null && typeof optionPolicy === "object" && !Array.isArray(optionPolicy))
		return optionPolicy as TokenPolicySnapshotOption;

	const settings = context.settings?.["yumcss-extraction"];
	if (settings === null || typeof settings !== "object" || Array.isArray(settings))
		return undefined;
	const settingsPolicy = (settings as Record<string, unknown>)["policy"];
	if (
		settingsPolicy === null ||
		typeof settingsPolicy !== "object" ||
		Array.isArray(settingsPolicy)
	)
		return undefined;
	return settingsPolicy as TokenPolicySnapshotOption;
};

/** Verified-token or declared escape hatch for one strict property literal. */
const strictPropertyAllows = (
	policy: TokenPolicySnapshotOption,
	property: string,
	value: string,
): boolean =>
	policy.tokenVocabulary?.[property]?.[value] !== undefined ||
	policy.allowedRawValuesByProperty?.[property]?.includes(value) === true ||
	policy.allowedRawValues?.includes(value) === true ||
	policy.allowedRawPrefixes?.some((prefix) => value.startsWith(prefix)) === true;

/** Collect string literals under strict property values (conditions stay
 * opaque, `$raw` is an explicit escape hatch) and report with property
 * provenance. */
const walkStrictPropertyLiterals = (
	moduleValue: AstValue,
	isStrict: (property: string) => boolean,
	seen: Set<AstNode>,
	report: (literal: AstNode, property: string) => void,
): void => {
	const stack: AstValue[] = [moduleValue];
	while (stack.length > 0) {
		const node = stack.pop();
		if (Array.isArray(node)) {
			for (let index = node.length - 1; index >= 0; index -= 1) stack.push(node[index]);
			continue;
		}
		if (!isNode(node)) continue;
		if (node.type === NodeKind.Property) {
			const name = propertyName(node);
			if (name === undefined) {
				stack.push(node.value);
				continue;
			}
			if (name === "$raw") continue;
			if (isStrict(name)) {
				walkDesignValues(node.value, seen, (literal) => report(literal, name));
			} else {
				// non-strict containers may still nest strict props (conditions, modules)
				stack.push(node.value);
			}
			continue;
		}
		if (node.type === NodeKind.ConditionalExpression || node.type === NodeKind.LogicalExpression)
			continue;
		const keys = Object.keys(node);
		for (let index = keys.length - 1; index >= 0; index -= 1) {
			const key = keys[index];
			if (key === undefined || key === "parent" || key === "type") continue;
			stack.push(node[key]);
		}
	}
};

const tokenPolicy = (context: RuleContext): { allows(value: string): boolean } | undefined => {
	const options = context.options?.[0];
	if (options === null || typeof options !== "object") return undefined;
	const settings = options as Record<string, unknown>;
	const allowedValues = Array.isArray(settings.allowedValues)
		? new Set(settings.allowedValues.filter((value): value is string => typeof value === "string"))
		: undefined;
	const allowedPrefixes = Array.isArray(settings.allowedPrefixes)
		? settings.allowedPrefixes.filter((value): value is string => typeof value === "string")
		: [];
	if (allowedValues === undefined && allowedPrefixes.length === 0) return undefined;
	return {
		allows(value: string): boolean {
			return (
				allowedValues?.has(value) === true ||
				allowedPrefixes.some((prefix) => value.startsWith(prefix))
			);
		},
	};
};

const callName = (api: ApiReference | undefined): string => api?.name ?? "yumcss";
const isIntentionalRuntimeLane = (api: ApiReference | undefined): boolean =>
	api?.kind === API.style && api.method !== undefined && RUNTIME_STYLE_METHODS.has(api.method);
const isExtractionLane = (api: ApiReference | undefined): boolean =>
	!isIntentionalRuntimeLane(api) &&
	(api?.kind === API.cx ||
		api?.kind === API.tw ||
		(api?.kind === API.style && (api.method === undefined || api.method === STYLE_METHOD.class)));
const isStaticLane = isExtractionLane;
const isTokenLane = (api: ApiReference | undefined): boolean => api !== undefined;
const isClassLane = (api: ApiReference | undefined): boolean =>
	api?.kind === API.cx || api?.kind === API.tw;

const walkWithAncestors = (
	root: AstValue,
	visit: (node: AstNode, ancestors: readonly AstNode[]) => void,
): void => {
	const stack: Array<{ value: AstValue; ancestors: readonly AstNode[] }> = [
		{ value: root, ancestors: [] },
	];
	while (stack.length > 0) {
		const current = stack.pop();
		if (current === undefined) continue;
		if (Array.isArray(current.value)) {
			for (let index = current.value.length - 1; index >= 0; index -= 1) {
				stack.push({ value: current.value[index], ancestors: current.ancestors });
			}
			continue;
		}
		if (!isNode(current.value)) continue;
		visit(current.value, current.ancestors);
		const ancestors = [...current.ancestors, current.value];
		const keys = Object.keys(current.value);
		for (let index = keys.length - 1; index >= 0; index -= 1) {
			const key = keys[index];
			if (key !== undefined && key !== "parent" && key !== "type")
				stack.push({ value: current.value[key], ancestors });
		}
	}
};

const firstThatWorksImports = (program: AstNode): ReadonlySet<string> => {
	const names = new Set<string>();
	walkNode(program, (node) => {
		if (node.type !== NodeKind.ImportDeclaration || sourceName(node.source) !== "yumcss/css")
			return;
		for (const specifier of node.specifiers ?? []) {
			if (
				specifier.type === NodeKind.ImportSpecifier &&
				specifier.imported?.type === NodeKind.Identifier &&
				specifier.imported.name === "firstThatWorks" &&
				specifier.local?.name !== undefined
			)
				names.add(specifier.local.name);
		}
	});
	return names;
};

type LiteralScopeAnalysis = {
	readonly evaluateCall: ReturnType<typeof createFirstThatWorksEvaluator>;
	readonly scopes: WeakMap<AstNode, ReadonlyMap<string, unknown>>;
};

const literalScopeAnalysisCache = new WeakMap<AstNode, LiteralScopeAnalysis>();

type CompilerStaticAnalysis = {
	readonly cxConstants: ReturnType<typeof collectModuleConstants>;
	readonly twConstants: Map<string, unknown>;
};

const compilerStaticAnalysisCache = new WeakMap<AstNode, CompilerStaticAnalysis>();

const compilerStaticAnalysisForProgram = (program: AstNode): CompilerStaticAnalysis => {
	const cached = compilerStaticAnalysisCache.get(program);
	if (cached !== undefined) return cached;
	const cxConstants = collectModuleConstants(program as never);
	const twConstants = new Map<string, unknown>();
	for (const [name, known] of cxConstants) twConstants.set(name, known.value);
	const analysis = { cxConstants, twConstants };
	compilerStaticAnalysisCache.set(program, analysis);
	return analysis;
};

const createLiteralScopeAnalysis = (program: AstNode): LiteralScopeAnalysis => {
	const cached = literalScopeAnalysisCache.get(program);
	if (cached !== undefined) return cached;
	const evaluateCall = createFirstThatWorksEvaluator(firstThatWorksImports(program));
	const resolveLiteralScope = createCssLiteralScopeResolver(program, evaluateCall);
	const scopes = new WeakMap<AstNode, ReadonlyMap<string, unknown>>();
	walkWithAncestors(program, (node, ancestors) => {
		if (node.type !== NodeKind.CallExpression) return;
		scopes.set(node, resolveLiteralScope(node, ancestors));
	});
	const analysis = { evaluateCall, scopes };
	literalScopeAnalysisCache.set(program, analysis);
	return analysis;
};

const literalScopeForCall = (
	analysis: LiteralScopeAnalysis,
	node: AstNode,
): ReadonlyMap<string, unknown> => analysis.scopes.get(node) ?? new Map();

const EMPTY_STATIC_BINDINGS: Pick<ReadonlySet<string>, "has"> = new Set();

const staticBindingsForCall = (
	analysis: LiteralScopeAnalysis,
	node: AstNode,
	fallback: Pick<ReadonlySet<string>, "has"> = EMPTY_STATIC_BINDINGS,
): Pick<ReadonlySet<string>, "has"> => analysis.scopes.get(node) ?? fallback;

const literalValueForCall = (
	analysis: LiteralScopeAnalysis,
	call: AstNode,
	node: AstNode | undefined,
): unknown =>
	evalLiteral(node as never, literalScopeForCall(analysis, call), analysis.evaluateCall);

const isCompilerStaticArgument = (options: {
	readonly api: ApiReference | undefined;
	readonly call: AstNode;
	readonly argument: AstNode;
	readonly compilerAnalysis: CompilerStaticAnalysis | undefined;
	readonly literalAnalysis: LiteralScopeAnalysis | undefined;
	readonly source: string;
}): boolean => {
	if (options.api?.kind === API.tw && options.compilerAnalysis !== undefined)
		return (
			evalTwLiteral(options.argument as never, options.compilerAnalysis.twConstants) !== undefined
		);
	if (options.api?.kind === API.cx && options.compilerAnalysis !== undefined) {
		if (
			evalStaticCx(options.argument as never, undefined, options.compilerAnalysis.cxConstants) !==
			CX_NOT_STATIC_VALUE
		)
			return true;
		if (options.call.callee?.type !== NodeKind.Identifier) return false;
		return (
			defaultCxCompilerPorts.buildSkeleton(
				options.argument as never,
				options.compilerAnalysis.cxConstants,
				options.source,
			) !== null
		);
	}
	if (options.api?.kind === API.style && options.literalAnalysis !== undefined) {
		const value = literalValueForCall(options.literalAnalysis, options.call, options.argument);
		return typeof value === "object" && value !== null;
	}
	return false;
};

const countPartialCxArguments = (options: {
	readonly argumentsList: readonly AstNode[];
	readonly compilerAnalysis: CompilerStaticAnalysis;
	readonly source: string;
}): number => {
	let count = 0;
	for (const argument of options.argumentsList) {
		if (
			evalStaticCx(argument as never, undefined, options.compilerAnalysis.cxConstants) ===
				CX_NOT_STATIC_VALUE &&
			defaultCxCompilerPorts.buildSkeleton(
				argument as never,
				options.compilerAnalysis.cxConstants,
				options.source,
			) !== null
		)
			count += 1;
	}
	return count;
};

const withResolver = (
	context: RuleContext,
	onCall: (
		node: AstNode,
		api: ApiReference | undefined,
		staticBindings: Pick<ReadonlySet<string>, "has">,
		resolveCall: (call: AstNode) => ApiReference | undefined,
	) => void,
	options: { readonly useLiteralScopes?: boolean } = {},
): RuleListener => {
	let resolver: ReturnType<typeof createApiResolver> | undefined;
	let literalAnalysis: LiteralScopeAnalysis | undefined;
	return {
		Program(node) {
			resolver = createApiResolver(node, configuredCssModuleExportsForContext(context));
			literalAnalysis = options.useLiteralScopes ? createLiteralScopeAnalysis(node) : undefined;
		},
		CallExpression(node) {
			if (resolver === undefined) return;
			const staticBindings =
				literalAnalysis === undefined
					? resolver.staticBindings
					: staticBindingsForCall(literalAnalysis, node, resolver.staticBindings);
			onCall(node, resolver.resolve(node), staticBindings, resolver.resolve);
		},
	};
};

const carrierResidualReason = (code: string): string => {
	switch (code) {
		case CssInlineResidualCode.Spread:
			return "dynamic spread";
		case CssInlineResidualCode.PathCollision:
			return "ancestor/descendant style collision";
		case CssInlineResidualCode.DynamicFallback:
			return "dynamic firstThatWorks fallback";
		case CssInlineResidualCode.NestedArray:
			return "nested array value";
		case CssInlineResidualCode.NestedFunction:
			return "function-valued style entry";
		case CssInlineResidualCode.ComputedKey:
			return "computed style key";
		case CssInlineResidualCode.NonObject:
			return "non-object style argument";
		default:
			return "unsupported style shape";
	}
};

const carrierTarget = (
	node: AstNode,
	ancestors: readonly AstNode[],
	resolver: ReturnType<typeof createApiResolver>,
):
	| {
			node: AstNode;
			api: ApiReference;
			forceDynamic: boolean;
			additionalArguments?: readonly AstNode[];
	  }
	| undefined => {
	const api = resolver.resolve(node);
	if (api?.kind !== API.style) return undefined;
	if (api.method === STYLE_METHOD.props) {
		const vars = node.arguments?.[0];
		const varsApi = isNode(vars) ? resolver.resolve(vars) : undefined;
		return varsApi?.kind === API.style && varsApi.method === STYLE_METHOD.vars
			? {
					node: vars,
					api: varsApi,
					forceDynamic: true,
					additionalArguments: (node.arguments ?? []).slice(1),
				}
			: undefined;
	}
	if (api.method !== undefined) return undefined;
	const parent = ancestors.at(-1);
	return parent?.type === NodeKind.JSXSpreadAttribute && parent.argument === node
		? { node, api, forceDynamic: false }
		: undefined;
};

const reportCarrierResiduals = (program: AstNode, context: RuleContext): void => {
	const resolver = createApiResolver(program, configuredCssModuleExportsForContext(context));
	const literalAnalysis = createLiteralScopeAnalysis(program);
	const fallbackNames = firstThatWorksImports(program);
	const fallbackValueNames = findCssFallbackValueNames(program, fallbackNames);
	walkWithAncestors(program, (node, ancestors) => {
		if (node.type !== NodeKind.CallExpression) return;
		const target = carrierTarget(node, ancestors, resolver);
		if (target === undefined) return;
		const isStatic = (value: AstNode): boolean =>
			literalValueForCall(literalAnalysis, target.node, value) !== undefined;
		const isStaticString = (value: AstNode): boolean => {
			const literal = literalValueForCall(literalAnalysis, target.node, value);
			return typeof literal === "string" && literal.length > 0;
		};
		const unsupportedAdditionalArgument = target.additionalArguments?.find(
			(argument) => !isStaticString(argument),
		);
		if (unsupportedAdditionalArgument !== undefined) {
			context.report({
				node: unsupportedAdditionalArgument,
				message:
					"yumcss: non-static additional prop in {{name}}() cannot use the direct build-time carrier — the Vite transform keeps the runtime path",
				data: { name: callName(target.api) },
			});
			return;
		}
		const analysis = analyzeCssInlineArguments(target.node.arguments ?? [], {
			evaluateStatic: (value) => {
				const literal = literalValueForCall(literalAnalysis, target.node, value);
				return literal === undefined ? CSS_INLINE_UNKNOWN : literal;
			},
			isStaticSpread: isStatic,
			forceDynamic: target.forceDynamic,
			canonicalizeKey: canonicalStyleKey,
			isDynamicFallback: (value) =>
				(value.type === NodeKind.Identifier && fallbackValueNames.has(value.name)) ||
				(value.type === NodeKind.CallExpression &&
					value.callee?.type === NodeKind.Identifier &&
					fallbackNames.has(value.callee.name)),
		});
		if (analysis.residuals.length === 0) return;
		const residual = analysis.residuals[0]!;
		const fullyStatic = (target.node.arguments ?? []).every(isStatic);
		if (
			analysis.dynamicWinners.length === 0 &&
			residual.code !== CssInlineResidualCode.Spread &&
			fullyStatic
		)
			return;
		context.report({
			node: residual.node ?? target.node,
			message:
				"yumcss: {{reason}} in {{name}}() cannot use the direct build-time carrier — the Vite transform keeps the runtime path",
			data: { reason: carrierResidualReason(residual.code), name: callName(target.api) },
		});
	});
};

type MigrationMarker = SourceComment & { reason: string };
type CallAnalysis = {
	node: AstNode;
	api: ApiReference;
	dynamic?: DynamicExpression;
};

const migrationAnalysisCache = new WeakMap<AstNode, Map<string, CallAnalysis[]>>();

const migrationMarkerFor = (context: RuleContext): string => {
	const option = context.options?.[0];
	if (option === null || typeof option !== "object") return MIGRATION_MARKER;
	const marker = (option as Record<string, unknown>).marker;
	return typeof marker === "string" && marker.trim() !== "" ? marker : MIGRATION_MARKER;
};

const migrationMarkers = (context: RuleContext): MigrationMarker[] => {
	const comments = context.sourceCode?.getAllComments?.() ?? [];
	const marker = migrationMarkerFor(context);
	const markers: MigrationMarker[] = [];
	for (const comment of comments) {
		const markerIndex = comment.value.indexOf(marker);
		if (markerIndex < 0) continue;
		const reason = comment.value.slice(markerIndex + marker.length).trim();
		markers.push({ ...comment, reason });
	}
	return markers;
};

const hasMigrationReason = (marker: MigrationMarker): boolean =>
	marker.reason !== "" && marker.reason !== "()";

const migrationAnalysis = (program: AstNode, context: RuleContext): CallAnalysis[] => {
	const cssModuleExports = configuredCssModuleExportsForContext(context);
	const cacheKey = cssModuleExportsCacheKey(cssModuleExports);
	const cached = migrationAnalysisCache.get(program)?.get(cacheKey);
	if (cached !== undefined) return cached;
	const resolver = createApiResolver(program, cssModuleExports);
	const literalAnalysis = createLiteralScopeAnalysis(program);
	const calls: CallAnalysis[] = [];
	walkNode(program, (node) => {
		if (node.type !== NodeKind.CallExpression) return;
		const api = resolver.resolve(node);
		if (api === undefined) return;
		const staticBindings = staticBindingsForCall(literalAnalysis, node);
		const dynamic = isExtractionLane(api)
			? node.arguments
					.map((argument: AstNode) =>
						findDynamicExpression({
							root: argument,
							staticBindings,
							resolveCall: resolver.resolve,
						}),
					)
					.find(
						(issue: DynamicExpression | undefined): issue is DynamicExpression =>
							issue !== undefined,
					)
			: undefined;
		calls.push({ node, api, dynamic });
	});
	const programCache = migrationAnalysisCache.get(program) ?? new Map<string, CallAnalysis[]>();
	programCache.set(cacheKey, calls);
	migrationAnalysisCache.set(program, programCache);
	return calls;
};

const markerForCall = (
	marker: MigrationMarker,
	call: AstNode,
	source: string,
): MigrationMarker | undefined => {
	if (marker.end === undefined || call.start === undefined || call.start < marker.end)
		return undefined;
	const gap = source.slice(marker.end, call.start);
	const trimmedGap = gap.trim();
	if (trimmedGap !== "" && trimmedGap !== "...") return undefined;
	const lineBreaks = (gap.match(/\n/g) ?? []).length;
	return lineBreaks <= 1 ? marker : undefined;
};

const markerForAnyCall = (
	markers: readonly MigrationMarker[],
	call: AstNode,
	source: string,
): MigrationMarker | undefined => {
	for (let index = markers.length - 1; index >= 0; index -= 1) {
		const marker = markers[index];
		if (marker === undefined) continue;
		const match = markerForCall(marker, call, source);
		if (match !== undefined) return match;
	}
	return undefined;
};

type CssModuleExports = ReadonlyMap<string, ReadonlySet<string>>;
type CssModuleConfiguration = { readonly cssModules?: unknown };
type CssModuleEntry = { readonly source: string; readonly exports: readonly unknown[] };
type RawTypedCssValueFixPlan = {
	readonly insertions: readonly { readonly node: AstNode; readonly text: string }[];
	readonly removals: readonly (readonly [number, number])[];
};

const isCssModuleConfiguration = (value: unknown): value is CssModuleConfiguration =>
	value !== null && typeof value === "object" && !Array.isArray(value) && "cssModules" in value;

const isCssModuleEntry = (value: unknown): value is CssModuleEntry =>
	value !== null &&
	typeof value === "object" &&
	!Array.isArray(value) &&
	"source" in value &&
	typeof value.source === "string" &&
	"exports" in value &&
	Array.isArray(value.exports);

const isStringValue = (value: unknown): value is string => typeof value === "string";

const configuredCssModuleExports = (option: unknown): CssModuleExports => {
	const configured = new Map<string, ReadonlySet<string>>();
	if (!isCssModuleConfiguration(option)) return configured;
	const cssModules = option.cssModules;
	if (!Array.isArray(cssModules)) return configured;
	for (const cssModule of cssModules) {
		if (!isCssModuleEntry(cssModule)) continue;
		const exports = new Set(cssModule.exports.filter(isStringValue));
		if (exports.size > 0) configured.set(cssModule.source, exports);
	}
	return configured;
};

const configuredCssModuleExportsForContext = (context: RuleContext): CssModuleExports => {
	const settings = context.settings?.["yumcss-extraction"];
	const settingsExports = configuredCssModuleExports(settings);
	if (settingsExports.size > 0) return settingsExports;
	return configuredCssModuleExports(context.options?.[0]);
};

const hasComment = (source: string): boolean => source.includes("/*") || source.includes("//");

const hasCommentBetweenProperties = (
	properties: readonly AstNode[],
	firstIndex: number,
	lastIndex: number,
	source: string,
): boolean => {
	for (let index = firstIndex; index < lastIndex; index += 1) {
		const current = properties[index];
		const next = properties[index + 1];
		if (
			current === undefined ||
			next === undefined ||
			typeof current.end !== "number" ||
			typeof next.start !== "number" ||
			hasComment(source.slice(current.end, next.start))
		)
			return true;
	}
	return false;
};

const rawIndependentFixPlan = (
	property: AstNode,
	rawProperties: readonly AstNode[],
	typedValueIndices: readonly number[],
	typedValueNames: ReadonlySet<string>,
	source: string,
): RawTypedCssValueFixPlan | undefined => {
	const typedIndices = new Set(typedValueIndices);
	for (const typedName of typedValueNames) {
		for (let index = 0; index < rawProperties.length; index += 1) {
			if (typedIndices.has(index)) continue;
			const sibling = rawProperties[index];
			if (sibling === undefined) return undefined;
			const name = propertyName(sibling);
			if (name === undefined || cssPropertiesMayConflict(typedName, name)) return undefined;
		}
	}

	const removals: (readonly [number, number])[] = [];
	let index = 0;
	while (index < rawProperties.length) {
		if (!typedIndices.has(index)) {
			index += 1;
			continue;
		}
		const firstIndex = index;
		while (typedIndices.has(index + 1)) index += 1;
		const lastIndex = index;
		const first = rawProperties[firstIndex];
		const last = rawProperties[lastIndex];
		const previous = rawProperties[firstIndex - 1];
		const next = rawProperties[lastIndex + 1];
		if (
			first === undefined ||
			last === undefined ||
			typeof first.start !== "number" ||
			typeof last.end !== "number"
		)
			return undefined;

		if (firstIndex === 0) {
			if (
				next === undefined ||
				typeof next.start !== "number" ||
				typeof first.end !== "number" ||
				hasCommentBetweenProperties(rawProperties, firstIndex, lastIndex + 1, source)
			)
				return undefined;
			removals.push([first.start, next.start]);
		} else if (lastIndex === rawProperties.length - 1) {
			if (
				previous === undefined ||
				typeof previous.end !== "number" ||
				hasCommentBetweenProperties(rawProperties, firstIndex - 1, lastIndex, source)
			)
				return undefined;
			removals.push([previous.end, last.end]);
		} else {
			if (
				next === undefined ||
				typeof next.start !== "number" ||
				hasCommentBetweenProperties(rawProperties, firstIndex, lastIndex + 1, source)
			)
				return undefined;
			removals.push([first.start, next.start]);
		}
		index += 1;
	}

	const movedText = typedValueIndices
		.map((itemIndex) => rawProperties[itemIndex])
		.filter(isNode)
		.map((item) => source.slice(item.start, item.end))
		.join(", ");
	return {
		insertions: [{ node: property, text: `${movedText}, ` }],
		removals,
	};
};

type TypedCssValueInfo = { readonly hasTypedValue: boolean; readonly onlyTypedValues: boolean };

const typedCssValueInfo = (
	value: AstNode | undefined,
	property: string,
	tokenVocabulary: PresetTokenVocabulary | undefined,
): TypedCssValueInfo => {
	if (value?.type === NodeKind.Literal) {
		if (typeof value.value === "number") return { hasTypedValue: true, onlyTypedValues: true };
		return typeof value.value === "string" &&
			(isTypedCssStringValue(property, value.value) ||
				tokenVocabulary?.[property]?.[value.value] !== undefined)
			? { hasTypedValue: true, onlyTypedValues: true }
			: { hasTypedValue: false, onlyTypedValues: false };
	}
	if (
		value?.type === NodeKind.UnaryExpression &&
		(value.operator === "-" || value.operator === "+") &&
		value.argument?.type === NodeKind.Literal &&
		typeof value.argument.value === "number"
	)
		return { hasTypedValue: true, onlyTypedValues: true };
	if (value?.type !== NodeKind.ObjectExpression || !Array.isArray(value.properties))
		return { hasTypedValue: false, onlyTypedValues: false };
	let hasTypedValue = false;
	let onlyTypedValues = value.properties.length > 0;
	for (const condition of value.properties) {
		if (condition?.type !== NodeKind.Property || condition.computed === true) {
			onlyTypedValues = false;
			continue;
		}
		const child = typedCssValueInfo(condition.value, property, tokenVocabulary);
		hasTypedValue ||= child.hasTypedValue;
		onlyTypedValues &&= child.onlyTypedValues;
	}
	return { hasTypedValue, onlyTypedValues: hasTypedValue && onlyTypedValues };
};

const intersectTokenVocabularies = (
	left: PresetTokenVocabulary,
	right: PresetTokenVocabulary,
): PresetTokenVocabulary => {
	const intersection: Record<string, Record<string, string>> = {};
	for (const [property, values] of Object.entries(left)) {
		const matchingValues: Record<string, string> = {};
		for (const [value, tokenId] of Object.entries(values)) {
			if (right[property]?.[value] === tokenId) matchingValues[value] = tokenId;
		}
		if (Object.keys(matchingValues).length > 0) intersection[property] = matchingValues;
	}
	return intersection;
};

const tokenVocabulariesEqual = (
	left: PresetTokenVocabulary,
	right: PresetTokenVocabulary,
): boolean => {
	const leftProperties = Object.keys(left);
	const rightProperties = Object.keys(right);
	return (
		leftProperties.length === rightProperties.length &&
		leftProperties.every((property) => {
			const leftValues = left[property];
			const rightValues = right[property];
			if (leftValues === undefined || rightValues === undefined) return false;
			const values = Object.keys(leftValues);
			return (
				values.length === Object.keys(rightValues).length &&
				values.every((value) => leftValues[value] === rightValues[value])
			);
		})
	);
};

const rawTypedCssValueFixPlan = (
	property: AstNode,
	parent: AstNode | undefined,
	source: string,
	tokenVocabulary: PresetTokenVocabulary | undefined,
): RawTypedCssValueFixPlan | undefined => {
	if (
		property.computed === true ||
		property.value?.type !== NodeKind.ObjectExpression ||
		parent?.type !== NodeKind.ObjectExpression ||
		!Array.isArray(property.value.properties) ||
		!Array.isArray(parent.properties) ||
		typeof property.start !== "number" ||
		typeof property.end !== "number"
	)
		return undefined;

	const rawProperties: AstNode[] = property.value.properties;
	const parentProperties: AstNode[] = parent.properties;
	if (
		rawProperties.length === 0 ||
		rawProperties.some((item) => item.type !== NodeKind.Property || item.computed === true) ||
		parentProperties.some((item) => item.type !== NodeKind.Property)
	)
		return undefined;
	const rawKeyCounts = new Map<string, number>();
	for (const item of rawProperties) {
		const name = propertyName(item);
		if (name === undefined) return undefined;
		rawKeyCounts.set(name, (rawKeyCounts.get(name) ?? 0) + 1);
	}
	const typedValueIndices: number[] = [];
	const typedValueNames = new Set<string>();
	for (let index = 0; index < rawProperties.length; index += 1) {
		const candidate = rawProperties[index];
		if (candidate?.type !== NodeKind.Property || candidate.computed === true) continue;
		const name = propertyName(candidate);
		if (
			name === undefined ||
			!typedCssValueInfo(candidate.value, name, tokenVocabulary).onlyTypedValues
		)
			continue;
		typedValueIndices.push(index);
		typedValueNames.add(name);
	}
	if (typedValueIndices.length === 0) return undefined;
	for (const name of typedValueNames) if (rawKeyCounts.get(name) !== 1) return undefined;

	for (const sibling of parentProperties) {
		if (sibling === property) continue;
		if (sibling.computed === true) return undefined;
		const name = propertyName(sibling);
		if (name === undefined || typedValueNames.has(name)) return undefined;
	}

	const firstIndex = typedValueIndices[0];
	const lastIndex = typedValueIndices.at(-1);
	if (firstIndex === undefined || lastIndex === undefined) return undefined;
	const first = rawProperties[firstIndex];
	const last = rawProperties[lastIndex];
	if (
		first === undefined ||
		last === undefined ||
		typeof first.start !== "number" ||
		typeof first.end !== "number" ||
		typeof last.start !== "number" ||
		typeof last.end !== "number"
	)
		return undefined;

	const allTypedValues = typedValueIndices.length === rawProperties.length;
	if (allTypedValues) {
		if (
			hasComment(source.slice(property.start, first.start)) ||
			hasComment(source.slice(last.end, property.end))
		)
			return undefined;
		return {
			insertions: [],
			removals: [
				[property.start, first.start],
				[last.end, property.end],
			],
		};
	}

	const isPrefix =
		firstIndex === 0 &&
		typedValueIndices.every((index, offset) => index === offset) &&
		typedValueIndices.length < rawProperties.length;
	if (isPrefix) {
		const next = rawProperties[typedValueIndices.length];
		if (
			next === undefined ||
			typeof next.start !== "number" ||
			hasCommentBetweenProperties(rawProperties, firstIndex, typedValueIndices.length, source)
		)
			return undefined;
		const movedText = typedValueIndices
			.map((index) => rawProperties[index])
			.filter(isNode)
			.map((item) => source.slice(item.start, item.end))
			.join(", ");
		return {
			insertions: [{ node: property, text: `${movedText}, ` }],
			removals: [[first.start, next.start]],
		};
	}

	const isSuffix =
		lastIndex === rawProperties.length - 1 &&
		typedValueIndices.every((index, offset) => index === firstIndex + offset) &&
		firstIndex > 0;
	if (isSuffix && !hasCommentBetweenProperties(rawProperties, firstIndex - 1, lastIndex, source)) {
		const previous = rawProperties[firstIndex - 1];
		const rawPropertyIndex = parentProperties.indexOf(property);
		const nextSibling = parentProperties[rawPropertyIndex + 1];
		if (
			previous !== undefined &&
			typeof previous.end === "number" &&
			nextSibling !== undefined &&
			typeof nextSibling.start === "number" &&
			!hasComment(source.slice(property.end, nextSibling.start))
		) {
			const movedText = typedValueIndices
				.map((index) => rawProperties[index])
				.filter(isNode)
				.map((item) => source.slice(item.start, item.end))
				.join(", ");
			return {
				insertions: [{ node: nextSibling, text: `${movedText}, ` }],
				removals: [[previous.end, last.end]],
			};
		}
	}

	return rawIndependentFixPlan(property, rawProperties, typedValueIndices, typedValueNames, source);
};

const rules: Record<string, RuleDefinition> = {
	"no-dynamic-carrier-fallback": {
		create(context) {
			return {
				Program(node) {
					reportCarrierResiduals(node, context);
				},
			};
		},
	},
	"no-dynamic-keyframes": {
		create(context) {
			return {
				Program(node) {
					const resolver = createApiResolver(node, configuredCssModuleExportsForContext(context));
					const literalAnalysis = createLiteralScopeAnalysis(node);
					walkWithAncestors(node, (current) => {
						if (current.type !== NodeKind.CallExpression) return;
						const api = resolver.resolve(current);
						if (api?.kind !== API.style || api.method !== STYLE_METHOD.keyframes) return;
						const body = current.arguments?.[0];
						const literal = literalValueForCall(literalAnalysis, current, body);
						if (current.arguments?.length === 1 && isLiteralKeyframeBody(literal)) return;
						context.report({
							node: body ?? current,
							message:
								"yumcss: {{name}}() needs one static object literal body — keep every step and declaration literal or move @keyframes to authored CSS",
							data: { name: callName(api) },
						});
					});
				},
			};
		},
	},
	"no-dollar-raw": {
		create(context) {
			return withResolver(context, (node, api) => {
				if (!isTokenLane(api)) return;
				for (const arg of node.arguments) {
					walkNode(arg, (inner) => {
						if (inner.type !== NodeKind.Property || propertyName(inner) !== "$raw") return;
						context.report({
							node: inner,
							message:
								"yumcss: $raw in {{name}}() escapes the design system — model the value as a token or extend the preset",
							data: { name: callName(api) },
						});
					});
				}
			});
		},
	},
	"prefer-typed-css-values": {
		meta: {
			fixable: "code",
			schema: [
				{
					type: "object",
					properties: {
						cssModules: {
							type: "array",
							items: {
								type: "object",
								properties: {
									source: { type: "string" },
									exports: { type: "array", items: { type: "string" }, minItems: 1 },
								},
								required: ["source", "exports"],
								additionalProperties: false,
							},
						},
					},
					additionalProperties: false,
				},
			],
		},
		create(context) {
			return {
				Program(program) {
					const source = context.sourceCode?.text;
					if (source === undefined) return;
					const filename = context.physicalFilename ?? context.filename;
					const projectTokenVocabulary = createProjectTokenVocabularyResolver({
						program,
						...(filename === undefined ? {} : { filename }),
						...(context.cwd === undefined ? {} : { cwd: context.cwd }),
					});
					const resolver = createApiResolver(
						program,
						configuredCssModuleExportsForContext(context),
					);
					const literalAnalysis = createLiteralScopeAnalysis(program);
					const reported = new Set<AstNode>();
					const styleSpreadBindings = new Map<string, PresetTokenVocabulary>();
					const staticStyleBindings = new Set<string>();
					const declarations = new Map<string, AstNode>();
					const styleVocabularyForCall = (call: AstNode): PresetTokenVocabulary | undefined => {
						const binding = styleBindingPathForCall(call);
						return binding === undefined ? undefined : projectTokenVocabulary(binding);
					};
					const addStyleSpreadBinding = (
						name: string,
						tokenVocabulary: PresetTokenVocabulary | undefined,
					): boolean => {
						const next = tokenVocabulary ?? {};
						const current = styleSpreadBindings.get(name);
						if (current === undefined) {
							styleSpreadBindings.set(name, next);
							return true;
						}
						const intersection = intersectTokenVocabularies(current, next);
						if (tokenVocabulariesEqual(current, intersection)) return false;
						styleSpreadBindings.set(name, intersection);
						return true;
					};
					const reportRawProperty = (
						property: AstNode,
						ancestors: readonly AstNode[],
						tokenVocabulary: PresetTokenVocabulary | undefined,
					): void => {
						if (
							property.type !== NodeKind.Property ||
							propertyName(property) !== "$raw" ||
							property.value?.type !== NodeKind.ObjectExpression ||
							!Array.isArray(property.value.properties) ||
							reported.has(property)
						)
							return;
						const names = new Set<string>();
						for (const candidate of property.value.properties) {
							if (candidate?.type !== NodeKind.Property || candidate.computed === true) continue;
							const name = propertyName(candidate);
							if (
								name !== undefined &&
								typedCssValueInfo(candidate.value, name, tokenVocabulary).hasTypedValue
							)
								names.add(name);
						}
						if (names.size === 0) return;
						reported.add(property);
						const parent = ancestors[ancestors.length - 1];
						const plan = rawTypedCssValueFixPlan(property, parent, source, tokenVocabulary);
						context.report({
							node: property,
							message:
								"yumcss: values for {{properties}} are covered by YumCSS's CSS types or the resolved preset — move them into the style object",
							data: { properties: [...names].join(", ") },
							...(plan === undefined
								? {}
								: {
										fix: (fixer: RuleFixer) => [
											...plan.insertions.map((insertion) =>
												fixer.insertTextBefore(insertion.node, insertion.text),
											),
											...plan.removals.map((range) => fixer.removeRange(range)),
										],
									}),
						});
					};
					for (const statement of program.body ?? []) {
						const declaration = Array.isArray(statement.declarations)
							? statement
							: isNode(statement.declaration) && Array.isArray(statement.declaration.declarations)
								? statement.declaration
								: undefined;
						if (declaration === undefined) continue;
						for (const declarator of declaration.declarations ?? []) {
							if (declarator.id?.type === NodeKind.Identifier && declarator.init !== undefined)
								declarations.set(declarator.id.name, declarator.init);
						}
					}
					walkWithAncestors(program, (current, ancestors) => {
						if (current.type === NodeKind.CallExpression) {
							const api = resolver.resolve(current);
							const insideFunction = ancestors.some(
								(ancestor) =>
									ancestor.type === NodeKind.FunctionDeclaration ||
									ancestor.type === NodeKind.FunctionExpression ||
									ancestor.type === NodeKind.ArrowFunctionExpression,
							);
							if (api?.kind === API.style && api.factory === API.cssFactory && !insideFunction) {
								const tokenVocabulary = styleVocabularyForCall(current);
								const staticBindings = staticBindingsForCall(
									literalAnalysis,
									current,
									resolver.staticBindings,
								);
								for (const name of literalAnalysis.scopes.get(current)?.keys() ?? [])
									staticStyleBindings.add(name);
								for (const argument of current.arguments ?? []) {
									walkWithAncestors(argument, (inner, innerAncestors) => {
										if (
											inner.type === NodeKind.SpreadElement &&
											inner.argument?.type === NodeKind.Identifier &&
											staticBindings.has(inner.argument.name) &&
											innerAncestors[innerAncestors.length - 1]?.type === NodeKind.ObjectExpression
										) {
											staticStyleBindings.add(inner.argument.name);
											addStyleSpreadBinding(inner.argument.name, tokenVocabulary);
										}
									});
								}
							}
						}
						if (current.type !== NodeKind.Property || propertyName(current) !== "$raw") return;
						for (let index = ancestors.length - 1; index >= 0; index -= 1) {
							const ancestor = ancestors[index];
							if (ancestor?.type !== NodeKind.CallExpression) continue;
							const api = resolver.resolve(ancestor);
							if (api?.kind === API.style && api.factory === API.cssFactory)
								reportRawProperty(current, ancestors, styleVocabularyForCall(ancestor));
							break;
						}
					});
					const pendingBindings = [...styleSpreadBindings.keys()];
					const processedBindings = new Map<string, PresetTokenVocabulary>();
					while (pendingBindings.length > 0) {
						const name = pendingBindings.pop();
						const tokenVocabulary = name === undefined ? undefined : styleSpreadBindings.get(name);
						if (
							name === undefined ||
							tokenVocabulary === undefined ||
							(processedBindings.has(name) &&
								tokenVocabulariesEqual(processedBindings.get(name) ?? {}, tokenVocabulary)) ||
							!resolver.staticBindings.has(name)
						)
							continue;
						processedBindings.set(name, tokenVocabulary);
						const initializer = declarations.get(name);
						if (initializer === undefined) continue;
						walkWithAncestors(initializer, (current) => {
							if (
								current.type === NodeKind.SpreadElement &&
								current.argument?.type === NodeKind.Identifier
							)
								if (
									staticStyleBindings.has(current.argument.name) &&
									addStyleSpreadBinding(current.argument.name, tokenVocabulary)
								)
									pendingBindings.push(current.argument.name);
						});
					}
					for (const [name, tokenVocabulary] of styleSpreadBindings) {
						if (!staticStyleBindings.has(name)) continue;
						const initializer = declarations.get(name);
						if (initializer === undefined) continue;
						walkWithAncestors(initializer, (current, ancestors) => {
							if (current.type === NodeKind.Property && propertyName(current) === "$raw")
								reportRawProperty(current, ancestors, tokenVocabulary);
						});
					}
				},
			};
		},
	},
	"no-arbitrary-values": {
		create(context) {
			return withResolver(context, (node, api) => {
				if (!isClassLane(api)) return;
				for (const arg of node.arguments) {
					walkNode(arg, (inner) => {
						if (
							inner.type !== NodeKind.Literal ||
							typeof inner.value !== "string" ||
							!ARBITRARY_RE.test(inner.value)
						)
							return;
						context.report({
							node: inner,
							message:
								'yumcss: arbitrary value "{{value}}" bypasses the design system — use a token ({{name}}() lane)',
							data: { value: inner.value, name: callName(api) },
						});
					});
				}
			});
		},
	},
	"design-tokens-only": {
		create(context) {
			const governance = governancePolicy(context);
			const configuredPolicy = governance === undefined ? tokenPolicy(context) : undefined;
			return withResolver(context, (node, api) => {
				if (!isTokenLane(api)) return;
				if (governance !== undefined) {
					// Unresolved governance policy stays report-only (fail-open):
					// strictness is unknown, so the rule must stay silent.
					if (!governance.resolved) return;
					const strict = new Set(governance.strictProperties ?? []);
					if (strict.size === 0) return;
					for (const arg of node.arguments) {
						const seen = new Set<AstNode>();
						walkStrictPropertyLiterals(
							arg,
							(name) => strict.has(name),
							seen,
							(literal, property) => {
								if (strictPropertyAllows(governance, property, literal.value)) return;
								context.report({
									node: literal,
									message:
										'yumcss: "{{value}}" is not a verified token for "{{property}}" (strict policy) — use a project token or an explicit escape hatch',
									data: { value: literal.value, property },
								});
							},
						);
					}
					return;
				}
				if (configuredPolicy === undefined) return;
				for (const arg of node.arguments) {
					const seen = new Set<AstNode>();
					walkNode(arg, (inner) => {
						const name = propertyName(inner);
						if (
							inner.type !== NodeKind.Property ||
							name === undefined ||
							!DESIGN_MODULE_KEYS.has(name)
						)
							return;
						walkDesignValues(inner.value, seen, (literal) => {
							if (configuredPolicy.allows(literal.value)) return;
							context.report({
								node: literal,
								message:
									'yumcss: "{{value}}" is not part of the configured design system — use a verified token or extend the project policy',
								data: { value: literal.value },
							});
						});
					});
				}
			});
		},
	},
	"no-spreads": {
		create(context) {
			return withResolver(context, (node, api) => {
				if (!isStaticLane(api)) return;
				for (const arg of node.arguments) {
					if (arg.type !== NodeKind.SpreadElement) continue;
					context.report({
						node: arg,
						message:
							"yumcss: spread argument in {{name}}() can never be statically folded — pass explicit arguments",
						data: { name: callName(api) },
					});
				}
			});
		},
	},
	"no-dynamic-values": {
		create(context) {
			let resolver: ReturnType<typeof createApiResolver> | undefined;
			let compilerAnalysis: CompilerStaticAnalysis | undefined;
			let literalAnalysis: LiteralScopeAnalysis | undefined;
			let program: AstNode | undefined;
			return {
				Program(node) {
					program = node;
					resolver = createApiResolver(node, configuredCssModuleExportsForContext(context), {
						includeUnconfiguredStyleFacades: false,
					});
				},
				CallExpression(node) {
					const currentResolver = resolver;
					if (currentResolver === undefined || program === undefined) return;
					const api = currentResolver.resolve(node);
					if (api === undefined || !isStaticLane(api)) return;
					if ((api.kind === API.tw || api.kind === API.cx) && compilerAnalysis === undefined)
						compilerAnalysis = compilerStaticAnalysisForProgram(program);
					if (api.kind === API.style && literalAnalysis === undefined)
						literalAnalysis = createLiteralScopeAnalysis(program);
					const source = context.sourceCode?.text ?? "";
					for (const argument of node.arguments) {
						if (
							isCompilerStaticArgument({
								api,
								call: node,
								argument,
								compilerAnalysis,
								literalAnalysis,
								source,
							})
						)
							continue;
						const dynamic = findDynamicExpression({
							root: argument,
							staticBindings:
								api.kind === API.style && literalAnalysis !== undefined
									? staticBindingsForCall(literalAnalysis, node, currentResolver.staticBindings)
									: EMPTY_STATIC_BINDINGS,
							resolveCall: currentResolver.resolve,
							inspectConditionalTests: api.kind !== API.style,
						});
						if (dynamic === undefined) continue;
						context.report({
							node: dynamic.node,
							message:
								"yumcss: {{bad}} in {{name}}() stays at runtime — use a literal, a statically provable const, or a single conditional",
							data: { bad: dynamic.bad, name: callName(api) },
						});
					}
				},
			};
		},
	},
	"no-multiple-conditionals": {
		create(context) {
			let resolver: ReturnType<typeof createApiResolver> | undefined;
			let compilerAnalysis: CompilerStaticAnalysis | undefined;
			let program: AstNode | undefined;
			return {
				Program(node) {
					program = node;
					resolver = createApiResolver(node, configuredCssModuleExportsForContext(context));
				},
				CallExpression(node) {
					const api = resolver?.resolve(node);
					if (
						api?.kind !== API.cx ||
						node.callee?.type !== NodeKind.Identifier ||
						program === undefined
					)
						return;
					compilerAnalysis ??= compilerStaticAnalysisForProgram(program);
					const count = countPartialCxArguments({
						argumentsList: node.arguments,
						compilerAnalysis,
						source: context.sourceCode?.text ?? "",
					});
					if (count <= 1) return;
					context.report({
						node,
						message:
							"yumcss: {{n}} dynamic conditionals in one {{name}}() call — only one partially folds, split the call",
						data: { n: count, name: callName(api) },
					});
				},
			};
		},
	},
	"no-redundant-cx": {
		create(context) {
			return withResolver(context, (node, api) => {
				if (api?.kind !== API.cx || node.arguments?.length !== 1) return;
				const input = node.arguments[0];
				if (
					input?.type !== NodeKind.Literal ||
					typeof input.value !== "string" ||
					input.value.includes("\u0000") ||
					/\s/.test(input.value)
				)
					return;
				context.report({
					node,
					message:
						"yumcss: cx() returns this single static string unchanged — use it directly; keep cx() when inputs need merging",
				});
			});
		},
	},
	"migration-skip-reason": {
		create(context) {
			return {
				Program() {
					for (const marker of migrationMarkers(context)) {
						if (hasMigrationReason(marker)) continue;
						context.report({
							node: marker as AstNode,
							message:
								"yumcss: migration skip markers must include a reason describing the preserved residual",
							data: { marker: migrationMarkerFor(context) },
						});
					}
				},
			};
		},
	},
	"no-stale-migration-skip": {
		meta: { fixable: "code" },
		create(context) {
			return {
				Program(node) {
					const source = context.sourceCode?.text ?? "";
					const markers = migrationMarkers(context);
					for (const call of migrationAnalysis(node, context)) {
						if (!isExtractionLane(call.api)) continue;
						if (call.dynamic !== undefined) continue;
						const marker = markerForAnyCall(markers, call.node, source);
						if (marker === undefined) continue;
						const { start, end } = marker;
						context.report({
							node: marker as AstNode,
							message:
								"yumcss: migration skip marker is stale because the following call is statically foldable",
							data: { name: callName(call.api) },
							...(start === undefined || end === undefined
								? {}
								: { fix: (fixer: RuleFixer) => fixer.removeRange([start, end]) }),
						});
					}
				},
			};
		},
	},
	"require-migration-residual": {
		meta: { fixable: "code" },
		create(context) {
			return {
				Program(node) {
					const source = context.sourceCode?.text ?? "";
					const markers = migrationMarkers(context);
					for (const call of migrationAnalysis(node, context)) {
						const dynamic = call.dynamic;
						if (dynamic === undefined) continue;
						if (markerForAnyCall(markers, call.node, source) !== undefined) continue;
						context.report({
							node: dynamic.node,
							message:
								"yumcss: dynamic static-lane output must preserve a typed migration residual with yumcss:migrate-skip",
							data: { bad: dynamic.bad, name: callName(call.api) },
							...(call.node.start === undefined
								? {}
								: {
										fix: (fixer: RuleFixer) =>
											fixer.insertTextBefore(
												call.node,
												`/* ${migrationMarkerFor(context)} (residual: ${dynamic.bad}) */ `,
											),
									}),
						});
					}
				},
			};
		},
	},
	"no-conflicting-style-props": {
		create(context) {
			return {
				Program(node) {
					const resolver = createApiResolver(node, configuredCssModuleExportsForContext(context));
					walkNode(node, (opening) => {
						if (opening.type !== NodeKind.JSXOpeningElement) return;
						let stylePropsSpread = false;
						const explicitProps: { name: string; node: AstNode }[] = [];
						for (const attribute of opening.attributes ?? []) {
							if (attribute.type === NodeKind.JSXSpreadAttribute) {
								const expression = attribute.argument;
								if (
									expression?.type === NodeKind.CallExpression &&
									resolver.resolve(expression)?.method === STYLE_METHOD.props
								)
									stylePropsSpread = true;
								continue;
							}
							if (attribute.type !== NodeKind.JSXAttribute) continue;
							const name = attribute.name?.name;
							if (name === "className" || name === "style")
								explicitProps.push({ name, node: attribute });
						}
						if (!stylePropsSpread) return;
						for (const prop of explicitProps) {
							context.report({
								node: prop.node,
								message:
									"yumcss: explicit {{prop}} conflicts with css.props() output — merge the value before spreading host props",
								data: { prop: prop.name },
							});
						}
					});
				},
			};
		},
	},
	"prefer-css-props-spread": {
		meta: { fixable: "code" },
		create(context) {
			return {
				Program(program) {
					const source = context.sourceCode?.text;
					if (source === undefined) return;
					const resolver = createApiResolver(
						program,
						configuredCssModuleExportsForContext(context),
					);
					walkWithAncestors(program, (attribute, ancestors) => {
						if (
							attribute.type !== NodeKind.JSXAttribute ||
							attribute.name?.name !== "className" ||
							attribute.value?.type !== NodeKind.JSXExpressionContainer
						)
							return;
						const expression = attribute.value.expression;
						if (
							expression?.type !== NodeKind.MemberExpression ||
							expression.computed === true ||
							expression.property?.name !== "className"
						)
							return;
						const propsCall = expression.object;
						const api = isNode(propsCall) ? resolver.resolve(propsCall) : undefined;
						if (
							propsCall?.type !== NodeKind.CallExpression ||
							api?.kind !== API.style ||
							api.method !== STYLE_METHOD.props ||
							api.factory === API.designFactory
						)
							return;

						let opening: AstNode | undefined;
						for (let index = ancestors.length - 1; index >= 0; index -= 1) {
							if (ancestors[index]?.type === NodeKind.JSXOpeningElement) {
								opening = ancestors[index];
								break;
							}
						}
						if (!Array.isArray(opening?.attributes)) return;
						const hasStyleOrUnknownSpread = opening.attributes.some(
							(sibling: AstNode) =>
								sibling !== attribute &&
								(sibling.type === NodeKind.JSXSpreadAttribute ||
									(sibling.type === NodeKind.JSXAttribute && sibling.name?.name === "style")),
						);
						if (hasStyleOrUnknownSpread) return;

						let includesClassString = false;
						for (const argument of propsCall.arguments ?? []) {
							walkNode(argument, (inner) => {
								if (
									inner.type === NodeKind.CallExpression &&
									resolver.resolve(inner)?.method === STYLE_METHOD.class
								)
									includesClassString = true;
							});
						}
						if (includesClassString) return;

						const start = attribute.start;
						const end = attribute.end;
						const callStart = propsCall.start;
						const callEnd = propsCall.end;
						if (
							typeof start !== "number" ||
							typeof end !== "number" ||
							typeof callStart !== "number" ||
							typeof callEnd !== "number"
						)
							return;
						const propsCallText = source.slice(callStart, callEnd);
						context.report({
							node: attribute,
							message:
								"yumcss: spread css.props() on the host so its className and style outputs are both preserved",
							fix: (fixer: RuleFixer) => [
								fixer.replaceTextRange([start, end], `{...${propsCallText}}`),
							],
						});
					});
				},
			};
		},
	},
	"prefer-css-map-in-props": {
		meta: { fixable: "code" },
		create(context) {
			const reported = new Set<AstNode>();
			return withResolver(context, (node, api, _staticBindings, resolveCall) => {
				if (
					api?.kind !== API.style ||
					api.method !== STYLE_METHOD.props ||
					api.factory === API.designFactory
				)
					return;
				for (const argument of node.arguments ?? []) {
					walkNode(argument, (inner) => {
						if (inner.type !== NodeKind.CallExpression || reported.has(inner)) return;
						const innerApi = resolveCall(inner);
						if (
							innerApi?.kind !== API.style ||
							innerApi.method !== STYLE_METHOD.class ||
							innerApi.factory === API.designFactory
						)
							return;
						reported.add(inner);
						const member = inner.callee;
						const methodAccess =
							member?.type === NodeKind.MemberExpression &&
							member.computed !== true &&
							member.property?.name === STYLE_METHOD.class &&
							typeof member.object?.end === "number" &&
							typeof member.property?.end === "number"
								? { start: member.object.end, end: member.property.end }
								: undefined;
						const source = context.sourceCode?.text;
						const fixRange =
							methodAccess !== undefined &&
							source?.slice(methodAccess.start, methodAccess.end) === ".class"
								? methodAccess
								: undefined;
						context.report({
							node: inner,
							message:
								"yumcss: css.class() returns an opaque string; use css() inside css.props() to preserve authored style composition and support xcss overrides",
							...(fixRange === undefined
								? {}
								: {
										fix: (fixer: RuleFixer) => [fixer.removeRange([fixRange.start, fixRange.end])],
									}),
						});
					});
				}
			});
		},
	},
	"no-raw-ast-identities": {
		create(context) {
			return {
				Program(node) {
					walkNode(node, (inner) => {
						const literal = rawAstIdentityNode(inner);
						if (literal === undefined) return;
						context.report({
							node: literal,
							message:
								"yumcss: raw parser node identity {{value}} must use NodeKind or the owning typed identity table",
							data: { value: literal.value as string },
						});
					});
				},
			};
		},
	},
};

export default {
	rules,
	meta: {
		name: "yumcss-extraction",
		docs: { description: "yumcss static-extraction discipline" },
	},
};
