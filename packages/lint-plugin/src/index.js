/**
 * pandwind static-extraction discipline rules (oxlint JS plugin).
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
 */

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

const CORE_APIS = new Set([API.cx, API.tw]);
const STYLE_METHODS = new Set(["class", "vars", "props", "group", "input", "raw"]);
const DESIGN_MODULE_KEYS = new Set(["$frame", "$layout", "$text"]);

const isNode = (value) =>
	value !== null && typeof value === "object" && typeof value.type === "string";

/**
 * Explicit depth-first traversal avoids call-stack exhaustion for generated
 * or user-authored ASTs. The reverse push preserves source order.
 */
const walkNode = (root, visit) => {
	const stack = Array.isArray(root) ? root.toReversed() : [root];
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
			if (key !== "parent" && key !== "type") stack.push(node[key]);
		}
	}
};

const propertyName = (property) => {
	if (property.type !== "Property") return undefined;
	const key = property.key;
	if (key?.type === "Identifier") return key.name;
	if (key?.type === "Literal") return String(key.value);
	return undefined;
};

const memberName = (member) => {
	if (member.type !== "MemberExpression") return undefined;
	if (!member.computed && member.property?.type === "Identifier") return member.property.name;
	if (member.computed && member.property?.type === "Literal") return String(member.property.value);
	return undefined;
};

const sourceName = (source) =>
	source?.type === "Literal" && typeof source.value === "string" ? source.value : undefined;

const importedName = (specifier) => {
	if (specifier.type !== "ImportSpecifier") return undefined;
	if (specifier.imported?.type === "Identifier") return specifier.imported.name;
	if (specifier.imported?.type === "Literal") return String(specifier.imported.value);
	return undefined;
};

const apiFromImport = (source, imported) => {
	if (source === SOURCE.core && CORE_APIS.has(imported)) return imported;
	if (source === SOURCE.css && imported === API.cssFactory) return API.cssFactory;
	if (source === SOURCE.design && imported === API.designFactory) return API.designFactory;
	return undefined;
};

/**
 * Resolve only real Pandwind bindings. This intentionally rejects unrelated
 * local functions named `cx`, `tw`, or `css`; aliases and namespace imports
 * remain fully supported without putting ecosystem checks in every rule.
 */
const createApiResolver = () => {
	const direct = new Map();
	const namespaces = new Map();
	const factories = new Map();
	const instances = new Set();

	const registerImport = (node) => {
		const source = sourceName(node.source);
		if (source !== SOURCE.core && source !== SOURCE.css && source !== SOURCE.design) return;
		for (const specifier of node.specifiers ?? []) {
			if (specifier.type === "ImportNamespaceSpecifier") {
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

	const resolveMember = (expression) => {
		if (!isNode(expression) || expression.type !== "MemberExpression") return undefined;
		if (expression.object?.type !== "Identifier") return undefined;
		const object = expression.object.name;
		const property = memberName(expression);
		if (property === undefined) return undefined;
		const namespace = namespaces.get(object);
		if (namespace !== undefined) return apiFromImport(namespace, property);
		if (instances.has(object) && STYLE_METHODS.has(property)) return API.style;
		return undefined;
	};

	const resolveFactory = (expression) => {
		if (!isNode(expression) || expression.type !== "CallExpression") return undefined;
		if (expression.callee?.type === "Identifier") return factories.get(expression.callee.name);
		return resolveMember(expression.callee);
	};

	const scan = (program) => {
		walkNode(program, (node) => {
			if (node.type === "ImportDeclaration") registerImport(node);
		});
		walkNode(program, (node) => {
			if (node.type !== "VariableDeclarator" || node.id?.type !== "Identifier") return;
			const factory = resolveFactory(node.init);
			if (factory === API.cssFactory || factory === API.designFactory) instances.add(node.id.name);
		});
	};

	const resolve = (call) => {
		if (call.type !== "CallExpression") return undefined;
		if (call.callee?.type === "Identifier") {
			const kind = direct.get(call.callee.name);
			if (kind !== undefined) return { kind, name: call.callee.name };
			if (instances.has(call.callee.name)) return { kind: API.style, name: call.callee.name };
			return undefined;
		}
		const kind = resolveMember(call.callee);
		if (kind === undefined) return undefined;
		return { kind, name: `${call.callee.object.name}.${memberName(call.callee)}` };
	};

	return { scan, resolve };
};

const countDynamicConditionals = (args) =>
	args.filter(
		(arg) =>
			arg.type === "ConditionalExpression" ||
			(arg.type === "LogicalExpression" && ["||", "??"].includes(arg.operator)),
	).length;

/** Arbitrary-value class token: `w-[13px]`, `[margin-top:7px]`. */
const ARBITRARY_RE = /\[[^\]\s]+\]/;

/**
 * Walk one design module's values without recursing. `$raw` is an explicit
 * escape hatch and conditional branches stay opaque to avoid false positives.
 */
const walkDesignValues = (root, seen, report) => {
	const stack = [root];
	while (stack.length > 0) {
		const node = stack.pop();
		if (Array.isArray(node)) {
			for (let index = node.length - 1; index >= 0; index -= 1) stack.push(node[index]);
			continue;
		}
		if (!isNode(node)) continue;
		if (node.type === "Property" && propertyName(node) === "$raw") continue;
		if (node.type === "Literal" && typeof node.value === "string") {
			if (!seen.has(node)) {
				seen.add(node);
				report(node);
			}
			continue;
		}
		if (node.type === "ConditionalExpression" || node.type === "LogicalExpression") continue;
		const keys = Object.keys(node);
		for (let index = keys.length - 1; index >= 0; index -= 1) {
			const key = keys[index];
			if (key !== "parent" && key !== "type") stack.push(node[key]);
		}
	}
};

const tokenPolicy = (context) => {
	const options = context.options?.[0];
	if (!options || typeof options !== "object") return undefined;
	const allowedValues = Array.isArray(options.allowedValues)
		? new Set(options.allowedValues.filter((value) => typeof value === "string"))
		: undefined;
	const allowedPrefixes = Array.isArray(options.allowedPrefixes)
		? options.allowedPrefixes.filter((value) => typeof value === "string")
		: [];
	if (allowedValues === undefined && allowedPrefixes.length === 0) return undefined;
	return {
		allows(value) {
			return (
				allowedValues?.has(value) === true ||
				allowedPrefixes.some((prefix) => value.startsWith(prefix))
			);
		},
	};
};

const callName = (api) => api?.name ?? "pandwind";
const isStaticLane = (api) => api !== undefined;
const isTokenLane = (api) => api !== undefined;
const isClassLane = (api) => api?.kind === API.cx || api?.kind === API.tw;

const withResolver = (onCall) => {
	const resolver = createApiResolver();
	return {
		Program(node) {
			resolver.scan(node);
		},
		CallExpression(node) {
			onCall(node, resolver.resolve(node));
		},
	};
};

const rules = {
	"no-dollar-raw": {
		create(context) {
			return withResolver((node, api) => {
				if (!isTokenLane(api)) return;
				for (const arg of node.arguments) {
					walkNode(arg, (inner) => {
						if (inner.type !== "Property" || propertyName(inner) !== "$raw") return;
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
							inner.type !== "Literal" ||
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
			const policy = tokenPolicy(context);
			return withResolver((node, api) => {
				if (policy === undefined || !isTokenLane(api)) return;
				for (const arg of node.arguments) {
					const seen = new Set();
					walkNode(arg, (inner) => {
						if (inner.type !== "Property" || !DESIGN_MODULE_KEYS.has(propertyName(inner))) return;
						walkDesignValues(inner.value, seen, (literal) => {
							if (policy.allows(literal.value)) return;
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
					if (arg.type !== "SpreadElement") continue;
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
			return withResolver((node, api) => {
				if (!isStaticLane(api)) return;
				for (const arg of node.arguments) {
					let bad;
					if (arg.type === "TemplateLiteral" && arg.expressions?.length)
						bad = "template interpolation";
					else if (arg.type === "MemberExpression") bad = "member expression value";
					else if (arg.type === "ArrowFunctionExpression" || arg.type === "FunctionExpression")
						bad = "function argument";
					else if (arg.type === "CallExpression") bad = "dynamic helper call";
					if (bad === undefined) continue;
					context.report({
						node: arg,
						message:
							"pandwind: {{bad}} in {{name}}() stays at runtime — use a literal, a module constant, or a single conditional",
						data: { bad, name: callName(api) },
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
};

export default {
	rules,
	meta: {
		name: "pandwind-extraction",
		docs: { description: "pandwind static-extraction discipline" },
	},
};
