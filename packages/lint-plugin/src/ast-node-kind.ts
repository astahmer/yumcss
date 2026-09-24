/**
 * Parser-independent AST node identities used by the lint plugin.
 *
 * The plugin is loaded by Oxlint and intentionally does not depend on the
 * parser package at runtime. These values mirror the parser's structural
 * discriminants while keeping every comparison typed and centralized.
 */
export const NodeKind = {
	ArrayExpression: "ArrayExpression",
	ArrowFunctionExpression: "ArrowFunctionExpression",
	AwaitExpression: "AwaitExpression",
	BinaryExpression: "BinaryExpression",
	CallExpression: "CallExpression",
	ChainExpression: "ChainExpression",
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
	JSXExpressionContainer: "JSXExpressionContainer",
	JSXOpeningElement: "JSXOpeningElement",
	JSXSpreadAttribute: "JSXSpreadAttribute",
	Literal: "Literal",
	LogicalExpression: "LogicalExpression",
	MemberExpression: "MemberExpression",
	NewExpression: "NewExpression",
	ObjectExpression: "ObjectExpression",
	ParenthesizedExpression: "ParenthesizedExpression",
	Program: "Program",
	Property: "Property",
	SpreadElement: "SpreadElement",
	TSAsExpression: "TSAsExpression",
	TSTypeAssertion: "TSTypeAssertion",
	TaggedTemplateExpression: "TaggedTemplateExpression",
	TemplateLiteral: "TemplateLiteral",
	TypeCastExpression: "TypeCastExpression",
	UnaryExpression: "UnaryExpression",
	VariableDeclaration: "VariableDeclaration",
	VariableDeclarator: "VariableDeclarator",
} as const;
