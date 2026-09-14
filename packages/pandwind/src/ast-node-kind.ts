/**
 * Typed identity for oxc AST node kinds, property kinds, import kinds, and
 * variable-declaration kinds.
 *
 * Comparisons against AST node data previously used raw string literals,
 * which drift silently when a name is misspelled or the parser renames a
 * kind. These `as const` tables carry the
 * same runtime values, so behavior is identical, while TypeScript verifies
 * each comparison against the parser's own type surface (see the compile-time
 * guard below).
 *
 * `as const` objects rather than `enum` syntax: this module is part of the
 * Vite/runtime hot path, where the Node strip-only loader executes TypeScript
 * directly and `enum` is unsupported.
 */

/** oxc re-exports the full parser AST types via `@oxc-project/types`. */
type OxcProgramNode = import("oxc-parser").Node;

const defineNodeKinds = <T extends Readonly<Record<string, string>>>(kinds: T): T => {
	// The guard below is what makes this wrapper load-bearing; runtime values
	// pass through untouched.
	return kinds;
};

/** Node `type` discriminators compared in pandwind control flow. */
export const NodeKind = defineNodeKinds({
	ArrayExpression: "ArrayExpression",
	ArrowFunctionExpression: "ArrowFunctionExpression",
	AssignmentExpression: "AssignmentExpression",
	BinaryExpression: "BinaryExpression",
	BlockStatement: "BlockStatement",
	CallExpression: "CallExpression",
	CatchClause: "CatchClause",
	ClassDeclaration: "ClassDeclaration",
	ConditionalExpression: "ConditionalExpression",
	ExportAllDeclaration: "ExportAllDeclaration",
	ExportDefaultDeclaration: "ExportDefaultDeclaration",
	ExportNamedDeclaration: "ExportNamedDeclaration",
	ExpressionStatement: "ExpressionStatement",
	FunctionDeclaration: "FunctionDeclaration",
	FunctionExpression: "FunctionExpression",
	Identifier: "Identifier",
	ImportDeclaration: "ImportDeclaration",
	ImportDefaultSpecifier: "ImportDefaultSpecifier",
	ImportNamespaceSpecifier: "ImportNamespaceSpecifier",
	ImportSpecifier: "ImportSpecifier",
	JSXAttribute: "JSXAttribute",
	JSXElement: "JSXElement",
	JSXEmptyExpression: "JSXEmptyExpression",
	JSXExpressionContainer: "JSXExpressionContainer",
	JSXFragment: "JSXFragment",
	JSXIdentifier: "JSXIdentifier",
	JSXMemberExpression: "JSXMemberExpression",
	JSXOpeningElement: "JSXOpeningElement",
	JSXSpreadAttribute: "JSXSpreadAttribute",
	Literal: "Literal",
	LogicalExpression: "LogicalExpression",
	MemberExpression: "MemberExpression",
	NewExpression: "NewExpression",
	ObjectExpression: "ObjectExpression",
	ObjectPattern: "ObjectPattern",
	ParenthesizedExpression: "ParenthesizedExpression",
	Program: "Program",
	Property: "Property",
	RestElement: "RestElement",
	ReturnStatement: "ReturnStatement",
	SpreadElement: "SpreadElement",
	TaggedTemplateExpression: "TaggedTemplateExpression",
	TemplateLiteral: "TemplateLiteral",
	TSAsExpression: "TSAsExpression",
	TSExportAssignment: "TSExportAssignment",
	TSSatisfiesExpression: "TSSatisfiesExpression",
	TSTypeAssertion: "TSTypeAssertion",
	UnaryExpression: "UnaryExpression",
	UpdateExpression: "UpdateExpression",
	VariableDeclaration: "VariableDeclaration",
	VariableDeclarator: "VariableDeclarator",
} as const);

/** `Property.kind` discriminators (object member shape). */
export const PropertyKindTag = {
	Init: "init",
	Get: "get",
	Set: "set",
} as const;

/** `importKind`/`exportKind` discriminators (value vs type-only). */
export const ImportKindTag = {
	Value: "value",
	Type: "type",
} as const;

/** `VariableDeclaration.kind` discriminators. */
export const VariableDeclarationKindTag = {
	Var: "var",
	Let: "let",
	Const: "const",
} as const;

// Compile-time guard: every NodeKind value must be a member of the parser's
// own `Node["type"]` union. A misspelled or renamed kind fails `tsc` here,
// in one place, instead of silently never matching at a comparison site.
type AssertNodeKinds<T extends Readonly<Record<string, string>>> = {
	[K in keyof T]: Extract<OxcProgramNode["type"], T[K]> extends never ? never : K;
};
const _nodeKindGuard: AssertNodeKinds<typeof NodeKind> = NodeKind;
void _nodeKindGuard;
