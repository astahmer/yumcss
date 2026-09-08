/**
 * pandwind static-extraction discipline rules (TypeScript source for the Oxlint JS plugin).
 *
 * The plugin enforces source-level constraints only. Project configuration,
 * official ecosystem loaders, CSS generation, and browser proofs belong to
 * the adapter and validator layers; this plugin must not guess them.
 *
 * Rules:
 * - no-spreads: spread arguments that cannot be statically folded
 * - no-dynamic-values: runtime-only argument shapes
 * - no-multiple-conditionals: more than one partially foldable conditional
 * - no-dollar-raw: explicit escape hatches from the token lane
 * - no-arbitrary-values: arbitrary class values in static lanes
 * - design-tokens-only: verified project token policy violations
 * - migration-skip-reason: migration skip markers must explain themselves
 * - no-stale-migration-skip: static calls must not retain stale skip markers
 * - require-migration-residual: dynamic static-lane calls need a marker
 * - no-conflicting-style-props: css.props() must not compete with host props
 * - no-raw-ast-identities: parser node discriminants must use an owned table
 */

import { NodeKind } from "./ast-node-kind.ts";

const SOURCE = Object.freeze({
	core: "pandwind",
	css: "pandwind/css",
	design: "pandwind/design",
});

const API = Object.freeze({
	cx: "cx",
	tw: "tw",
	cssFactory: "createCss",
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
});

const CORE_APIS = new Set<string>([API.cx, API.tw]);
const STYLE_METHODS = new Set<string>([
	STYLE_METHOD.class,
	STYLE_METHOD.vars,
	STYLE_METHOD.props,
	STYLE_METHOD.group,
	STYLE_METHOD.input,
	STYLE_METHOD.raw,
]);
const RUNTIME_STYLE_METHODS = new Set<string>([
	STYLE_METHOD.vars,
	STYLE_METHOD.props,
	STYLE_METHOD.group,
	STYLE_METHOD.input,
	STYLE_METHOD.raw,
]);
const DESIGN_MODULE_KEYS = new Set(["$frame", "$layout", "$text"]);
const MIGRATION_MARKER = "pandwind:migrate-skip";
const AST_IDENTITY_VALUES = new Set(Object.values(NodeKind));

type AstNode = { type: string; [key: string]: any };
type AstValue = AstNode | AstValue[] | null | undefined | string | number | boolean;
type AstVisitor = (node: AstNode) => void;
type ApiReference = { kind: string; name: string; method?: string };
type SourceComment = {
	type: string;
	value: string;
	start?: number;
	end?: number;
};
type RuleContext = {
	readonly options?: readonly unknown[];
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
};
type RuleListener = {
	Program?: (node: AstNode) => void;
	CallExpression?: (node: AstNode) => void;
};
type RuleDefinition = {
	create(context: RuleContext): RuleListener;
	meta?: { fixable?: "code" | "whitespace" };
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
	if (source === SOURCE.design && imported === API.designFactory) return API.designFactory;
	return undefined;
};

type DynamicExpression = { node: AstNode; bad: string };

/**
 * Check the same value shapes the static compiler can fold. The walk is
 * iterative because generated style objects can be much deeper than normal
 * authored code. Conditional branches are inspectable; their runtime test is
 * handled separately by the conditional-count rule.
 */
const findDynamicExpression = (
	root: AstValue,
	staticBindings: ReadonlySet<string>,
): DynamicExpression | undefined => {
	const stack: AstValue[] = [root];
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
				if (staticBindings.has(value.name)) continue;
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
			case NodeKind.CallExpression:
			case NodeKind.NewExpression:
			case NodeKind.TaggedTemplateExpression:
				return { node: value, bad: "dynamic helper call" };
			case NodeKind.SpreadElement:
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
 * Resolve only real Pandwind bindings. This intentionally rejects unrelated
 * local functions named `cx`, `tw`, or `css`; aliases and namespace imports
 * remain fully supported without putting ecosystem checks in every rule.
 */
const createApiResolver = () => {
	const direct = new Map<string, string>();
	const namespaces = new Map<string, string>();
	const factories = new Map<string, string>();
	const instances = new Set();
	const declarations = new Map<string, AstNode>();
	const staticBindings = new Set<string>();
	const shadowedCalls = new WeakSet<AstNode>();

	const registerImport = (node: AstNode): void => {
		if (node.importKind === IMPORT_KIND.type) return;
		const source = sourceName(node.source);
		if (source !== SOURCE.core && source !== SOURCE.css && source !== SOURCE.design) return;
		for (const specifier of node.specifiers ?? []) {
			if (specifier.importKind === IMPORT_KIND.type) continue;
			if (specifier.type === NodeKind.ImportNamespaceSpecifier) {
				namespaces.set(specifier.local.name, source);
				continue;
			}
			const imported = importedName(specifier);
			const api = apiFromImport(source, imported);
			if (api === undefined) continue;
			if (api === API.cssFactory || api === API.designFactory)
				factories.set(specifier.local.name, api);
			else direct.set(specifier.local.name, api);
		}
	};

	const resolveMember = (expression: unknown): string | undefined => {
		if (!isNode(expression) || expression.type !== NodeKind.MemberExpression) return undefined;
		if (expression.object?.type !== NodeKind.Identifier) return undefined;
		const object = expression.object.name;
		const property = memberName(expression);
		if (property === undefined) return undefined;
		const namespace = namespaces.get(object);
		if (namespace !== undefined) return apiFromImport(namespace, property);
		if (instances.has(object) && STYLE_METHODS.has(property)) return API.style;
		return undefined;
	};

	const resolveFactory = (expression: unknown): string | undefined => {
		if (!isNode(expression) || expression.type !== NodeKind.CallExpression) return undefined;
		if (expression.callee?.type === NodeKind.Identifier)
			return factories.get(expression.callee.name);
		return resolveMember(expression.callee);
	};

	const scan = (program: AstNode): void => {
		walkNode(program, (node) => {
			if (node.type === NodeKind.ImportDeclaration) registerImport(node);
		});
		walkNode(program, (node) => {
			if (node.type !== NodeKind.VariableDeclarator || node.id?.type !== NodeKind.Identifier)
				return;
			if (node.init !== undefined) declarations.set(node.id.name, node.init);
			const factory = resolveFactory(node.init);
			if (factory === API.cssFactory || factory === API.designFactory) instances.add(node.id.name);
		});
		for (let pass = 0; pass < declarations.size; pass += 1) {
			for (const [name, value] of declarations) {
				if (staticBindings.has(name) || findDynamicExpression(value, staticBindings) === undefined)
					staticBindings.add(name);
			}
		}

		const scopedStack: Array<{ value: AstValue; shadowed: ReadonlySet<string> }> = [
			{ value: program, shadowed: new Set() },
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
			if (instances.has(call.callee.name)) return { kind: API.style, name: call.callee.name };
			return undefined;
		}
		const kind = resolveMember(call.callee);
		if (kind === undefined) return undefined;
		const method = memberName(call.callee);
		return {
			kind,
			name: `${call.callee.object.name}.${method}`,
			...(instances.has(call.callee.object.name) ? { method } : {}),
		};
	};

	return { scan, resolve, staticBindings };
};

const countDynamicConditionals = (args: readonly AstNode[]): number => {
	let count = 0;
	const stack: AstValue[] = [...args];
	while (stack.length > 0) {
		const value = stack.pop();
		if (Array.isArray(value)) {
			for (let index = value.length - 1; index >= 0; index -= 1) stack.push(value[index]);
			continue;
		}
		if (!isNode(value)) continue;
		if (
			value.type === NodeKind.ConditionalExpression ||
			(value.type === NodeKind.LogicalExpression && ["||", "??"].includes(value.operator))
		)
			count += 1;
		for (const key of Object.keys(value)) {
			if (key !== "parent" && key !== "type") stack.push(value[key]);
		}
	}
	return count;
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
 * Declared locally on purpose: the lint plugin has no runtime dependency on
 * the analyzer, and the governance contract is versioned and additive, so
 * structural compatibility is sufficient. Unknown strictness (resolved:
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
	if (options === null || typeof options !== "object") return undefined;
	const policy = (options as Record<string, unknown>)["policy"];
	if (policy === null || typeof policy !== "object") return undefined;
	return policy as TokenPolicySnapshotOption;
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

const callName = (api: ApiReference | undefined): string => api?.name ?? "pandwind";
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

const withResolver = (
	onCall: (
		node: AstNode,
		api: ApiReference | undefined,
		staticBindings: ReadonlySet<string>,
	) => void,
): RuleListener => {
	const resolver = createApiResolver();
	return {
		Program(node) {
			resolver.scan(node);
		},
		CallExpression(node) {
			onCall(node, resolver.resolve(node), resolver.staticBindings);
		},
	};
};

type MigrationMarker = SourceComment & { reason: string };
type CallAnalysis = {
	node: AstNode;
	api: ApiReference;
	dynamic?: DynamicExpression;
};

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

const migrationAnalysis = (program: AstNode): CallAnalysis[] => {
	const resolver = createApiResolver();
	resolver.scan(program);
	const calls: CallAnalysis[] = [];
	walkNode(program, (node) => {
		if (node.type !== NodeKind.CallExpression) return;
		const api = resolver.resolve(node);
		if (api === undefined) return;
		const dynamic = isExtractionLane(api)
			? node.arguments
					.map((argument: AstNode) => findDynamicExpression(argument, resolver.staticBindings))
					.find(
						(issue: DynamicExpression | undefined): issue is DynamicExpression =>
							issue !== undefined,
					)
			: undefined;
		calls.push({ node, api, dynamic });
	});
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
	if (gap.trim() !== "") return undefined;
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

const rules: Record<string, RuleDefinition> = {
	"no-dollar-raw": {
		create(context) {
			return withResolver((node, api) => {
				if (!isTokenLane(api)) return;
				for (const arg of node.arguments) {
					walkNode(arg, (inner) => {
						if (inner.type !== NodeKind.Property || propertyName(inner) !== "$raw") return;
						context.report({
							node: inner,
							message:
								"pandwind: $raw in {{name}}() escapes the design system — model the value as a token or extend the preset",
							data: { name: callName(api) },
						});
					});
				}
			});
		},
	},
	"no-arbitrary-values": {
		create(context) {
			return withResolver((node, api) => {
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
								'pandwind: arbitrary value "{{value}}" bypasses the design system — use a token ({{name}}() lane)',
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
			return withResolver((node, api) => {
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
										'pandwind: "{{value}}" is not a verified token for "{{property}}" (strict policy) — use a project token or an explicit escape hatch',
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
									'pandwind: "{{value}}" is not part of the configured design system — use a verified token or extend the project policy',
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
			return withResolver((node, api) => {
				if (!isStaticLane(api)) return;
				for (const arg of node.arguments) {
					if (arg.type !== NodeKind.SpreadElement) continue;
					context.report({
						node: arg,
						message:
							"pandwind: spread argument in {{name}}() can never be statically folded — pass explicit arguments",
						data: { name: callName(api) },
					});
				}
			});
		},
	},
	"no-dynamic-values": {
		create(context) {
			return withResolver((node, api, staticBindings) => {
				if (!isStaticLane(api)) return;
				for (const arg of node.arguments) {
					const dynamic = findDynamicExpression(arg, staticBindings);
					if (dynamic === undefined) continue;
					context.report({
						node: dynamic.node,
						message:
							"pandwind: {{bad}} in {{name}}() stays at runtime — use a literal, a module constant, or a single conditional",
						data: { bad: dynamic.bad, name: callName(api) },
					});
				}
			});
		},
	},
	"no-multiple-conditionals": {
		create(context) {
			return withResolver((node, api) => {
				if (!isStaticLane(api)) return;
				const count = countDynamicConditionals(node.arguments);
				if (count <= 1) return;
				context.report({
					node,
					message:
						"pandwind: {{n}} dynamic conditionals in one {{name}}() call — only one partially folds, split the call",
					data: { n: count, name: callName(api) },
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
								"pandwind: migration skip markers must include a reason describing the preserved residual",
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
					for (const call of migrationAnalysis(node)) {
						if (!isExtractionLane(call.api)) continue;
						if (call.dynamic !== undefined) continue;
						const marker = markerForAnyCall(markers, call.node, source);
						if (marker === undefined) continue;
						const { start, end } = marker;
						context.report({
							node: marker as AstNode,
							message:
								"pandwind: migration skip marker is stale because the following call is statically foldable",
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
					for (const call of migrationAnalysis(node)) {
						const dynamic = call.dynamic;
						if (dynamic === undefined) continue;
						if (markerForAnyCall(markers, call.node, source) !== undefined) continue;
						context.report({
							node: dynamic.node,
							message:
								"pandwind: dynamic static-lane output must preserve a typed migration residual with pandwind:migrate-skip",
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
					const resolver = createApiResolver();
					resolver.scan(node);
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
									"pandwind: explicit {{prop}} conflicts with css.props() output — merge the value before spreading host props",
								data: { prop: prop.name },
							});
						}
					});
				},
			};
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
								"pandwind: raw parser node identity {{value}} must use NodeKind or the owning typed identity table",
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
		name: "pandwind-extraction",
		docs: { description: "pandwind static-extraction discipline" },
	},
};
