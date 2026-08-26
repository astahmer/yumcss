/**
 * pandwind static-extraction discipline rules (oxlint JS plugin).
 *
 * Mirrors the taxonomy from plans/012 §3.1 (stylex eslint-plugin steal):
 * keep `cx()` / `css()` calls analyzable so the vite folding passes can
 * eliminate them. Rules run at the WARNING tier — partial conditional
 * folding is legitimate, so conditionals are allowed; everything the
 * evaluator provably cannot fold is flagged.
 *
 * Rules:
 * - custom/pandwind-no-spreads:        spread arguments in cx() (never folds)
 * - custom/pandwind-no-dynamic-values: template interpolations, member
 *   expressions, function args and helper calls as cx() arguments
 * - custom/pandwind-no-multiple-conditionals: >1 dynamic conditional in one
 *   call (the pass folds exactly one)
 *
 * Strict-token rules (ERROR tier — the de-facto strict mode):
 * - pandwind-extraction/no-dollar-raw:      $raw property inside css()/cx()
 *   /tw()/createDesignCss() arguments
 * - pandwind-extraction/no-arbitrary-values: arbitrary-value class tokens
 *   (`w-[13px]`, `[margin-top:7px]`) in cx()/tw() string literals
 * - pandwind-extraction/design-tokens-only: plain strings inside
 *   $frame/$layout/$text modules that are neither token references, scale
 *   words nor numeric — conservative heuristic, unsure means silent
 *
 * Known limitation: identifier arguments are not resolved across scopes by
 * design (the build's constant propagation handles same-module/cross-module
 * consts; this lint only flags shapes that NEVER fold).
 */

const CX_LIKE_NAMES = new Set(["cx", "css", "tw"]);

/**
 * Calls whose arguments the design-token rules inspect. `dcss` is the
 * documented convention for createDesignCss() instances.
 */
const TOKEN_LANE_NAMES = new Set([...CX_LIKE_NAMES, "createDesignCss", "dcss"]);

const isCxCall = (node) =>
	node.type === "CallExpression" &&
	node.callee?.type === "Identifier" &&
	CX_LIKE_NAMES.has(node.callee.name);

const isTokenLaneCall = (node) =>
	node.type === "CallExpression" &&
	node.callee?.type === "Identifier" &&
	TOKEN_LANE_NAMES.has(node.callee.name);

const countDynamicConditionals = (args) =>
	args.filter(
		(arg) =>
			arg.type === "ConditionalExpression" ||
			(arg.type === "LogicalExpression" && ["||", "??"].includes(arg.operator)),
	).length;

/** Arbitrary-value class token: `w-[13px]`, `[margin-top:7px]`. */
const ARBITRARY_RE = /\[[^\]\s]+\]/;

/**
 * Design-vocabulary scale words accepted by design-tokens-only. Curated
 * from the `$frame`/`$layout`/`$text` modules — deliberately conservative:
 * anything not listed and not matching a value shape below is NOT reported.
 */
const SCALE_WORDS = new Set([
	// sizes / radii
	"none",
	"xs",
	"sm",
	"md",
	"lg",
	"xl",
	"2xl",
	"3xl",
	"full",
	"auto",
	// weights
	"thin",
	"light",
	"normal",
	"medium",
	"semibold",
	"bold",
	"black",
	// layout flow / wrap
	"stackX",
	"stackY",
	"grid",
	"wrap",
	"nowrap",
	// align / justify / distribute
	"start",
	"end",
	"center",
	"between",
	"around",
	"evenly",
	"stretch",
	"baseline",
	// position
	"relative",
	"absolute",
	"fixed",
	"sticky",
	"static",
	// overflow / misc
	"hidden",
	"scroll",
	"visible",
	"clip",
	"italic",
	"underline",
	"uppercase",
	"lowercase",
	"capitalize",
]);

const isNumericish = (value) =>
	/^\d+(\.\d+)?(px|%|rem|em|vh|vw)?$/.test(value) || /^-?\d+\/\d+$/.test(value);

/**
 * Conservative token check for design-css values. A string is fine when it
 * looks like a token reference, a number-ish scale value or a known scale
 * word. Everything else passes silently — false positives are worse than
 * false negatives here.
 */
const looksLikeDesignValue = (value) =>
	value.startsWith("$") || SCALE_WORDS.has(value) || isNumericish(value);

/**
 * Generic recursive AST walker for one call-argument subtree. Skips
 * `parent` back-references; tolerates arrays and non-node fields.
 */
const walkNode = (node, visit) => {
	if (node === null || node === undefined || typeof node !== "object") return;
	if (Array.isArray(node)) {
		for (const item of node) walkNode(item, visit);
		return;
	}
	if (typeof node.type !== "string") return;
	visit(node);
	for (const key of Object.keys(node)) {
		if (key === "parent" || key === "type") continue;
		walkNode(node[key], visit);
	}
};

const propertyName = (prop) => {
	if (prop.type !== "Property") return undefined;
	const key = prop.key;
	if (key?.type === "Identifier") return key.name;
	if (key?.type === "Literal") return String(key.value);
	return undefined;
};

const DESIGN_MODULE_KEYS = new Set(["$frame", "$layout", "$text"]);

/**
 * Walk one design module's values, reporting every off-system string.
 * Recursion stops at `$raw` subtrees (raw CSS is what `$raw` is FOR) and
 * dedupes through `seen` so nested conditional variants don't double-report.
 */
const walkDesignValues = (node, seen, report) => {
	if (node === null || node === undefined || typeof node !== "object") return;
	if (Array.isArray(node)) {
		for (const item of node) walkDesignValues(item, seen, report);
		return;
	}
	if (typeof node.type !== "string") return;
	if (node.type === "Property") {
		if (propertyName(node) === "$raw") return; // escape hatch stays unflagged here
	}
	if (node.type === "Literal" && typeof node.value === "string") {
		if (seen.has(node)) return;
		seen.add(node);
		report(node);
		return;
	}
	// Do not descend into conditionals: branch values may legitimately be
	// dynamic-token unions we cannot resolve statically.
	if (node.type === "ConditionalExpression" || node.type === "LogicalExpression") return;
	for (const key of Object.keys(node)) {
		if (key === "parent" || key === "type") continue;
		walkDesignValues(node[key], seen, report);
	}
};

const rules = {
	"no-dollar-raw": {
		create(context) {
			return {
				CallExpression(node) {
					if (!isTokenLaneCall(node)) return;
					for (const arg of node.arguments) {
						walkNode(arg, (inner) => {
							if (inner.type !== "Property") return;
							if (propertyName(inner) !== "$raw") return;
							context.report({
								node: inner,
								message:
									"pandwind: $raw in {{name}}() escapes the design system — model the value as a token or extend the preset",
								data: { name: node.callee.name },
							});
						});
					}
				},
			};
		},
	},
	"no-arbitrary-values": {
		create(context) {
			return {
				CallExpression(node) {
					if (!isCxCall(node)) return;
					for (const arg of node.arguments) {
						walkNode(arg, (inner) => {
							if (inner.type !== "Literal" || typeof inner.value !== "string") return;
							if (!ARBITRARY_RE.test(inner.value)) return;
							context.report({
								node: inner,
								message:
									'pandwind: arbitrary value "{{value}}" bypasses the design system — use a token ({{name}}() lane)',
								data: { value: inner.value, name: node.callee.name },
							});
						});
					}
				},
			};
		},
	},
	"design-tokens-only": {
		create(context) {
			return {
				CallExpression(node) {
					if (!isTokenLaneCall(node)) return;
					for (const arg of node.arguments) {
						// One dedupe set per argument: nested conditional variants
						// revisit the same literals through multiple module walks.
						const seen = new Set();
						walkNode(arg, (inner) => {
							if (inner.type !== "Property") return;
							if (!DESIGN_MODULE_KEYS.has(propertyName(inner))) return;
							walkDesignValues(inner.value, seen, (literal) => {
								if (looksLikeDesignValue(literal.value)) return;
								context.report({
									node: literal,
									message:
										'pandwind: "{{value}}" is not part of the design system — use a $token, a scale value or a number',
									data: { value: literal.value },
								});
							});
						});
					}
				},
			};
		},
	},
	"no-spreads": {
		create(context) {
			return {
				CallExpression(node) {
					if (!isCxCall(node)) return;
					for (const arg of node.arguments) {
						if (arg.type === "SpreadElement") {
							context.report({
								node: arg,
								message:
									"pandwind: spread argument in {{name}}() can never be statically folded — pass explicit arguments",
								data: { name: node.callee.name },
							});
						}
					}
				},
			};
		},
	},
	"no-dynamic-values": {
		create(context) {
			return {
				CallExpression(node) {
					if (!isCxCall(node)) return;
					for (const arg of node.arguments) {
						let bad;
						if (arg.type === "TemplateLiteral" && arg.expressions?.length) {
							bad = "template interpolation";
						} else if (arg.type === "MemberExpression") {
							bad = "member expression value";
						} else if (
							arg.type === "ArrowFunctionExpression" ||
							arg.type === "FunctionExpression"
						) {
							bad = "function argument";
						} else if (arg.type === "CallExpression") {
							bad = "dynamic helper call";
						}
						if (bad) {
							context.report({
								node: arg,
								message:
									"pandwind: {{bad}} in {{name}}() stays at runtime — use a literal, a module constant, or a single conditional",
								data: { bad, name: node.callee.name },
							});
						}
					}
				},
			};
		},
	},
	"no-multiple-conditionals": {
		create(context) {
			return {
				CallExpression(node) {
					if (!isCxCall(node)) return;
					const n = countDynamicConditionals(node.arguments);
					if (n > 1) {
						context.report({
							node,
							message:
								"pandwind: {{n}} dynamic conditionals in one {{name}}() call — only one partially folds, split the call",
							data: { n, name: node.callee.name },
						});
					}
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
