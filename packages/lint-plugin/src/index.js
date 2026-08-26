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
 * Known limitation: identifier arguments are not resolved across scopes by
 * design (the build's constant propagation handles same-module/cross-module
 * consts; this lint only flags shapes that NEVER fold).
 */

const CX_LIKE_NAMES = new Set(["cx", "css", "tw"]);

const isCxCall = (node) =>
	node.type === "CallExpression" &&
	node.callee?.type === "Identifier" &&
	CX_LIKE_NAMES.has(node.callee.name);

const countDynamicConditionals = (args) =>
	args.filter(
		(arg) =>
			arg.type === "ConditionalExpression" ||
			(arg.type === "LogicalExpression" && ["||", "??"].includes(arg.operator)),
	).length;

const rules = {
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
