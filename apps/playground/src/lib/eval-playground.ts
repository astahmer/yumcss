/**
 * Playground eval engine.
 *
 * Runs user-authored `tw(...)` / `css(...)` / `cx(...)` example files against
 * the app's real bindings and reports: the merged class string, which input
 * tokens survived vs were killed by conflict merging, and whether the build-
 * time folding pass would have eliminated the call (full/partial/runtime).
 *
 * TRUST MODEL: this executes the user's own code in their own browser via
 * `new Function` — exactly the same trust level as the devtools console.
 * It exists so authors can experiment locally; it is not a security
 * boundary and must never run third-party code.
 */
import { parseSync } from "oxc-parser";
import type { ClassNameStrategy } from "yumcss/css";
import { styleProgramFromSourceObject, type StyleProgram } from "@yumcss/codemod/swap/semantic-ir";
import { flattenStyle } from "yumcss/lib/utils";
import { collectModuleConstants } from "yumcss/vite/cx-inline";
import type { ConstantScope } from "yumcss/vite/cx-inline";
import { ImportKindTag, NodeKind } from "yumcss/tw/literal";

export interface PlaygroundHostNode {
	readonly type: string;
	readonly props: Readonly<Record<string, unknown>>;
	readonly children: readonly PlaygroundNode[];
}

export type PlaygroundNode =
	| null
	| boolean
	| number
	| string
	| PlaygroundHostNode
	| readonly PlaygroundNode[];

type PlaygroundAstNode = {
	type?: string;
	start?: number;
	end?: number;
	[key: string]: unknown;
};

const isPlaygroundAstNode = (value: unknown): value is PlaygroundAstNode => {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
	if ("type" in value && typeof value.type !== "string") return false;
	if ("start" in value && typeof value.start !== "number") return false;
	if ("end" in value && typeof value.end !== "number") return false;
	return true;
};

const astNode = (value: unknown): PlaygroundAstNode | undefined =>
	isPlaygroundAstNode(value) ? value : undefined;

const astSlice = (source: string, node: unknown): string => {
	const value = astNode(node);
	if (value?.start === undefined || value.end === undefined) return "";
	return source.slice(value.start, value.end);
};

const jsxNameExpression = (source: string, node: unknown): string => {
	const value = astNode(node);
	if (value?.type === "JSXIdentifier") {
		const name = typeof value.name === "string" ? value.name : astSlice(source, node);
		return /^[a-z]/u.test(name) || name.includes("-")
			? JSON.stringify(name)
			: astSlice(source, node);
	}
	return astSlice(source, node);
};

const jsxExpression = (source: string, node: unknown): string => {
	const value = astNode(node);
	if (value?.type === "JSXExpressionContainer") {
		const expression = astNode(value.expression);
		if (expression?.type === "JSXEmptyExpression") return "undefined";
		if (expression?.type === "JSXElement" || expression?.type === "JSXFragment")
			return renderPlaygroundJsx(expression, source);
		return astSlice(source, expression);
	}
	if (value?.type === "JSXElement" || value?.type === "JSXFragment")
		return renderPlaygroundJsx(value, source);
	return astSlice(source, node);
};

const renderPlaygroundJsx = (node: PlaygroundAstNode, source: string): string => {
	if (node.type === "JSXFragment") {
		const children = ((node.children as unknown[]) ?? [])
			.map((child) => renderPlaygroundJsxChild(child, source))
			.filter((child): child is string => child !== undefined);
		return `__pw.jsx(__pw.Fragment, {}, ${children.join(", ")})`;
	}
	const opening = astNode(node.openingElement);
	const name = jsxNameExpression(source, opening?.name);
	const attributes = ((opening?.attributes as unknown[]) ?? []).map((attribute) => {
		const value = astNode(attribute);
		if (value?.type === "JSXSpreadAttribute") {
			return `...(${astSlice(source, value.argument)})`;
		}
		const attributeName = astNode(value?.name);
		const key = JSON.stringify(
			typeof attributeName?.name === "string" ? attributeName.name : astSlice(source, value?.name),
		);
		return `${key}: ${value?.value === null || value?.value === undefined ? "true" : jsxExpression(source, value.value)}`;
	});
	const props = `{${attributes.join(", ")}}`;
	const children = ((node.children as unknown[]) ?? [])
		.map((child) => renderPlaygroundJsxChild(child, source))
		.filter((child): child is string => child !== undefined);
	const childArguments = children.length === 0 ? "" : `, ${children.join(", ")}`;
	return `__pw.jsx(${name}, ${props}${childArguments})`;
};

const renderPlaygroundJsxChild = (child: unknown, source: string): string | undefined => {
	const value = astNode(child);
	if (value?.type === "JSXText") {
		const text = typeof value.value === "string" ? value.value.replace(/\s+/gu, " ").trim() : "";
		return text === "" ? undefined : JSON.stringify(text);
	}
	if (value?.type === "JSXExpressionContainer") {
		const expression = astNode(value.expression);
		if (expression?.type === "JSXEmptyExpression") return undefined;
	}
	if (value?.type === "JSXSpreadChild") return `...(${astSlice(source, value.expression)})`;
	if (value?.type === "JSXElement" || value?.type === "JSXFragment")
		return renderPlaygroundJsx(value, source);
	if (value?.type === "JSXExpressionContainer") return jsxExpression(source, value);
	return astSlice(source, child);
};

const transformPlaygroundJsx = (source: string): string => {
	const parsed = parseSync("playground.tsx", source, { sourceType: "module", lang: "tsx" });
	const replacements: Array<[number, number, string]> = [];
	const walk = (node: unknown): void => {
		if (Array.isArray(node)) {
			for (const item of node) walk(item);
			return;
		}
		const value = astNode(node);
		if (value === undefined) return;
		if (value.type === "JSXElement" || value.type === "JSXFragment") {
			if (value.start !== undefined && value.end !== undefined)
				replacements.push([value.start, value.end, renderPlaygroundJsx(value, source)]);
			return;
		}
		for (const child of Object.values(value)) {
			if (child !== null && typeof child === "object") walk(child);
		}
	};
	walk(parsed.program);
	let output = source;
	for (const [start, end, replacement] of replacements.toSorted(
		(left, right) => right[0] - left[0],
	))
		output = output.slice(0, start) + replacement + output.slice(end);
	return output;
};

const stripPlaygroundTypes = (source: string): string => {
	const parsed = parseSync("playground.ts", source, { sourceType: "module", lang: "ts" });
	const edits: Array<[number, number, string]> = [];
	const addEdit = (start: unknown, end: unknown, replacement = ""): void => {
		if (typeof start === "number" && typeof end === "number" && end > start)
			edits.push([start, end, replacement]);
	};
	const walk = (node: unknown): void => {
		if (Array.isArray(node)) {
			for (const item of node) walk(item);
			return;
		}
		const value = astNode(node);
		if (value === undefined) return;
		if (
			value.type === "TSTypeAliasDeclaration" ||
			value.type === "TSInterfaceDeclaration" ||
			value.type === "TSEnumDeclaration" ||
			value.type === "TSModuleDeclaration" ||
			value.type === "TSDeclareFunction" ||
			value.type === "TSImportEqualsDeclaration"
		) {
			addEdit(value.start, value.end);
			return;
		}
		if (value.type === "TSTypeAnnotation") {
			addEdit(value.start, value.end);
			return;
		}
		if (
			value.type === "TSTypeParameterDeclaration" ||
			value.type === "TSTypeParameterInstantiation"
		) {
			addEdit(value.start, value.end);
			return;
		}
		if (value.type === NodeKind.TSAsExpression || value.type === NodeKind.TSSatisfiesExpression) {
			const expression = astNode(value.expression);
			addEdit(expression?.end, value.end);
		}
		if (value.type === "TSNonNullExpression" || value.type === "TSInstantiationExpression") {
			const expression = astNode(value.expression);
			addEdit(expression?.end, value.end);
		}
		for (const child of Object.values(value)) {
			if (child !== null && typeof child === "object") walk(child);
		}
	};
	walk(parsed.program);
	const selected: Array<[number, number, string]> = [];
	for (const edit of edits.toSorted((left, right) => left[0] - right[0] || right[1] - left[1])) {
		if (selected.some(([start, end]) => start <= edit[0] && end >= edit[1])) continue;
		selected.push(edit);
	}
	let output = source;
	for (const [start, end, replacement] of selected.toSorted((left, right) => right[0] - left[0]))
		output = output.slice(0, start) + replacement + output.slice(end);
	return output;
};

const PLAYGROUND_FRAGMENT = Symbol("playground-fragment");

const isPlaygroundHostNode = (value: unknown): value is PlaygroundHostNode => {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
	const candidate = value as Partial<PlaygroundHostNode>;
	return (
		typeof candidate.type === "string" &&
		candidate.props !== null &&
		typeof candidate.props === "object" &&
		Array.isArray(candidate.children)
	);
};

const isPlaygroundNode = (value: unknown): value is PlaygroundNode => {
	if (
		value === null ||
		typeof value === "boolean" ||
		typeof value === "number" ||
		typeof value === "string"
	)
		return true;
	if (Array.isArray(value)) return value.every(isPlaygroundNode);
	return isPlaygroundHostNode(value);
};

const collectPlaygroundChildren = (values: readonly unknown[]): PlaygroundNode[] => {
	const children: PlaygroundNode[] = [];
	const collect = (value: unknown): void => {
		if (value === null || typeof value === "boolean") return;
		if (Array.isArray(value)) {
			for (const item of value) collect(item);
			return;
		}
		if (isPlaygroundNode(value)) {
			children.push(value);
			return;
		}
		throw new Error("playground JSX children must be renderable values");
	};
	for (const value of values) collect(value);
	return children;
};

const createPlaygroundJsx = (
	type: unknown,
	props: unknown,
	...childValues: readonly unknown[]
): PlaygroundNode => {
	const children = collectPlaygroundChildren(childValues);
	if (type === PLAYGROUND_FRAGMENT) return children;
	if (typeof type === "function") {
		const componentProps: Record<string, unknown> =
			props !== null && typeof props === "object" && !Array.isArray(props)
				? { ...(props as Record<string, unknown>) }
				: {};
		componentProps.children =
			children.length === 0 ? undefined : children.length === 1 ? children[0] : children;
		const result = (type as (componentProps: Record<string, unknown>) => unknown)(componentProps);
		return result === undefined ? null : isPlaygroundNode(result) ? result : null;
	}
	if (typeof type !== "string")
		throw new Error("playground JSX can only render host elements or components");
	const hostProps: Record<string, unknown> =
		props !== null && typeof props === "object" && !Array.isArray(props)
			? { ...(props as Record<string, unknown>) }
			: {};
	delete hostProps.children;
	return { type, props: hostProps, children };
};

const findPlaygroundStyledHost = (
	node: PlaygroundNode,
	styledClasses: ReadonlySet<string>,
): PlaygroundHostNode | undefined => {
	if (Array.isArray(node)) {
		for (const child of node) {
			const styled = findPlaygroundStyledHost(child, styledClasses);
			if (styled !== undefined) return styled;
		}
		return undefined;
	}
	if (!isPlaygroundHostNode(node)) return undefined;
	const className = node.props.className;
	const hasGeneratedClass =
		typeof className === "string" &&
		splitClasses(className).some((token) => styledClasses.has(token));
	const hasInlineStyle = node.props.style !== null && typeof node.props.style === "object";
	if (hasGeneratedClass || hasInlineStyle) return node;
	for (const child of node.children) {
		const styled = findPlaygroundStyledHost(child, styledClasses);
		if (styled !== undefined) return styled;
	}
	return undefined;
};

const findPlaygroundClassHost = (node: PlaygroundNode): PlaygroundHostNode | undefined => {
	if (Array.isArray(node)) {
		for (const child of node) {
			const host = findPlaygroundClassHost(child);
			if (host !== undefined) return host;
		}
		return undefined;
	}
	if (!isPlaygroundHostNode(node)) return undefined;
	if (typeof node.props.className === "string" && node.props.className.trim() !== "") return node;
	for (const child of node.children) {
		const host = findPlaygroundClassHost(child);
		if (host !== undefined) return host;
	}
	return undefined;
};

export interface PlaygroundSheetResult {
	/** Adapter identity supplied to the runtime CSS factory. */
	strategy: string;
	/** Complete stylesheet currently owned by the runtime sheet. */
	css: string;
	/** Token declarations kept separately for the inspector. */
	tokens: string;
	/** Flat rules retained by the sheet, including their stable ids. */
	rules: Array<{ id: string; css: string; priority: number }>;
}

export interface PlaygroundStyleMapping {
	/** Class emitted for one flattened declaration. */
	className: string;
	/** Source property name, such as `backgroundColor`. */
	property: string;
	/** Authored value before it is resolved into CSS. */
	value: string;
	/** Nested condition path, outermost condition first. */
	conditions: string[];
	/** Whether this class survives into the final expression's class string. */
	active: boolean;
}

export const PLAYGROUND_EXECUTION_LANE = {
	Sandbox: "sandbox",
	PackageFixture: "package-fixture",
} as const;

export const PLAYGROUND_EXECUTION_SCOPE = {
	BrowserEvaluator: "browser-evaluator",
	ProjectPackage: "project-package",
} as const;

export const PLAYGROUND_EVIDENCE_CHECK = {
	RuntimeEvaluation: "runtime-evaluation",
	StyleProgramExtraction: "styleprogram-extraction",
	RuntimeSheetCss: "runtime-sheet-css",
	ProjectTypecheck: "project-typecheck",
	ProjectBuild: "project-build",
	BrowserHost: "browser-host",
	SsrBuild: "ssr-build",
	Hydration: "hydration",
} as const;

export interface PlaygroundExecutionEvidence {
	readonly lane: (typeof PLAYGROUND_EXECUTION_LANE)[keyof typeof PLAYGROUND_EXECUTION_LANE];
	readonly scope: (typeof PLAYGROUND_EXECUTION_SCOPE)[keyof typeof PLAYGROUND_EXECUTION_SCOPE];
	readonly verified: readonly string[];
	readonly unavailable: readonly string[];
	readonly note: string;
}

interface PlaygroundSuccess {
	ok: true;
	/** The merged class string produced by the runtime. */
	output: string;
	/** React host tree returned by the example's component expression. */
	rendered?: PlaygroundNode;
	/**
	 * Declaration map when the final expression returned one (plain css() /
	 * css.raw()); the class-string pane is replaced by a declarations pane.
	 */
	decls?: Record<string, string>;
	/** Class + inline-style pair from a css.vars() result. */
	varsOutput?: { class: string; style: Record<string, string> };
	/** Resolved React-style host props from a css.props() result. */
	propsOutput?: { className?: string; style?: Record<string, string> };
	/** Inline host styles produced by css.vars() / css.props() inside a composed expression. */
	runtimeStyle?: Record<string, string>;
	/** Every class token fed in through any call (deduped). */
	tokensIn: string[];
	/** Tokens present in the final output. */
	survived: string[];
	/** Input tokens that conflict-merging dropped. */
	killed: string[];
	/** Would the vite cx pass fold this away at build time? */
	fold: "full" | "partial" | "runtime";
	/** Why the fold verdict is what it is. */
	foldNote: string;
	/** Resolved declarations per css() literal call (class -> declarations). */
	atomDeclarations: Array<{ cls: string; decls: Record<string, string> }>;
	/** CSS produced by YumCSS-owned runtime sheets used by the example. */
	sheets: PlaygroundSheetResult[];
	/** Source declarations paired with the class emitted for each declaration. */
	styleMappings: PlaygroundStyleMapping[];
	/** Neutral semantic programs extracted from static style-call objects. */
	programs: StyleProgram[];
	/** What this browser evaluator proves, and which host checks remain unavailable. */
	execution: PlaygroundExecutionEvidence;
}

export type PlaygroundResult = PlaygroundSuccess | { ok: false; error: string };

const splitClasses = (value: string): string[] => value.split(/\s+/).filter(Boolean);

const dedupe = (values: Array<string>): string[] => [...new Set(values)];

interface Prepared {
	body: string;
	consts: ConstantScope;
	exprText: string;
	/** Rewritten module source with imports and export syntax lowered. */
	evalCode: string;
	/** Value imports collected from the stripped file. */
	imports: Array<{ local: string; source: string; imported?: string }>;
	/** Module-level names this file exports (sandbox export surface). */
	exportNames: Array<string>;
	/** Local binding that represents this module's default export, when present. */
	defaultExportName?: string;
	/** Span of the final expression statement, if present. */
	lastExpr?: { start: number; end: number };
	/** Module-level names the file declares itself (they shadow builtins). */
	declaredNames: Array<string>;
}

/**
 * Parse the full module once and classify every top-level statement:
 * imports are collected (never executed), exports are lowered to local
 * bindings, and the entry default export becomes the result when present.
 * JSX and TypeScript syntax are lowered separately before the source runs.
 */
function stripModule(code: string): Omit<Prepared, "body" | "consts" | "exprText"> {
	const parsed = parseSync("module-syntax.tsx", code, { sourceType: "module", lang: "tsx" });
	const statements = parsed.program.body;
	const imports: Prepared["imports"] = [];
	const exportNames: Array<string> = [];
	const cuts: Array<[number, number]> = [];
	const unwraps: Array<[number, number]> = [];
	const replacements: Array<[number, number, string]> = [];
	let defaultExportName: string | undefined;
	const syntheticDefaultExportName = "__pw_default_export";
	for (const statement of statements) {
		if (statement.type === NodeKind.ImportDeclaration) {
			if (statement.importKind === ImportKindTag.Type) {
				cuts.push([statement.start, statement.end]);
				continue;
			}
			const source = statement.source.value;
			for (const spec of statement.specifiers ?? []) {
				if (spec.type === NodeKind.ImportSpecifier && spec.importKind === ImportKindTag.Type)
					continue;
				if (spec.type === NodeKind.ImportSpecifier) {
					const imported =
						spec.imported.type === NodeKind.Identifier ? spec.imported.name : spec.imported.value;
					imports.push({ local: spec.local.name, source, imported });
				} else imports.push({ local: spec.local.name, source });
			}
			cuts.push([statement.start, statement.end]);
		} else if (statement.type === NodeKind.TSExportAssignment) {
			cuts.push([statement.start, statement.end]);
		} else if (statement.type === NodeKind.ExportDefaultDeclaration) {
			const declaration = astNode(statement.declaration);
			const declarationStart = declaration?.start;
			const declarationId = astNode(declaration?.id);
			if (
				(declaration?.type === NodeKind.FunctionDeclaration ||
					declaration?.type === NodeKind.ClassDeclaration) &&
				typeof declarationId?.name === "string" &&
				declarationStart !== undefined
			) {
				unwraps.push([statement.start, declarationStart]);
				defaultExportName = declarationId.name;
			} else if (declarationStart !== undefined) {
				replacements.push([
					statement.start,
					declarationStart,
					`const ${syntheticDefaultExportName} = `,
				]);
				defaultExportName = syntheticDefaultExportName;
			} else {
				cuts.push([statement.start, statement.end]);
			}
		} else if (statement.type === NodeKind.ExportNamedDeclaration) {
			const inner = statement.declaration;
			if (inner === null) cuts.push([statement.start, statement.end]);
			else {
				unwraps.push([statement.start, statement.start + "export ".length]);
				if (inner.type === NodeKind.VariableDeclaration) {
					for (const decl of inner.declarations) {
						if (decl.id.type === NodeKind.Identifier) exportNames.push(decl.id.name);
					}
				} else if (
					(inner.type === NodeKind.FunctionDeclaration ||
						inner.type === NodeKind.ClassDeclaration) &&
					inner.id !== null
				) {
					exportNames.push(inner.id.name);
				}
			}
		}
	}
	// Every edit is an (original-start, original-end, replacement) triple so
	// spans stay valid: apply them in one right-to-left pass.
	const edits: Array<[number, number, string]> = [
		...cuts.map(([start, end]): [number, number, string] => [start, end, ""]),
		...unwraps.map(([start, end]): [number, number, string] => [start, end, ""]),
		...replacements,
	].toSorted((left, right) => right[0] - left[0]);
	let evalCode = code;
	for (const [start, end, replacement] of edits)
		evalCode = evalCode.slice(0, start) + replacement + evalCode.slice(end);
	return { evalCode, imports, exportNames, defaultExportName, declaredNames: [] };
}

/**
 * Parse the module, lower imports/exports, locate the final top-level
 * expression when there is no default export, and collect module constants.
 */
/** Entry tabs return their default export; sibling tabs return export bindings. */
type EvalMode = "entry" | "module";

function prepare(code: string, mode: EvalMode): Prepared {
	const base = stripModule(code);
	const evalCode = stripPlaygroundTypes(transformPlaygroundJsx(base.evalCode));
	const parsed = parseSync("playground.ts", evalCode, { sourceType: "module", lang: "ts" });
	const statements = parsed.program.body;
	// Module-declared names shadow the sandbox builtins: an example that
	// says `const css = createUnsafeCss()` must receive its own css, not the
	// prebuilt binding injected under the same identifier.
	const declaredNames: Array<string> = [];
	for (const statement of statements) {
		if (statement.type === NodeKind.VariableDeclaration) {
			for (const decl of statement.declarations) {
				if (decl.id.type === NodeKind.Identifier) declaredNames.push(decl.id.name);
			}
		} else if (
			(statement.type === NodeKind.FunctionDeclaration ||
				statement.type === NodeKind.ClassDeclaration) &&
			statement.id !== null
		) {
			declaredNames.push(statement.id.name);
		}
	}
	// oxc's ExpressionStatement.end INCLUDES the trailing semicolon.
	let lastExpr: { start: number; end: number } | undefined;
	for (const statement of statements) {
		if (statement.type === NodeKind.ExpressionStatement) lastExpr = statement;
	}
	const consts = collectModuleConstants({ ...parsed.program });
	let body: string;
	let exprText = "";
	if (mode === "module") {
		// Sibling-tab mode: run the stripped file and return every exported
		// binding so the entry tab can import them as a real module.
		const exports = [
			...base.exportNames.map((name) => `${name}: ${name}`),
			...(base.defaultExportName === undefined ? [] : [`default: ${base.defaultExportName}`]),
		];
		body = evalCode + `\nreturn { ${exports.join(", ")} };`;
	} else if (base.defaultExportName !== undefined) {
		exprText = base.defaultExportName;
		body =
			"const __pwExports = {};\n" +
			evalCode +
			`\n__pwExports.value = ${base.defaultExportName};\nreturn __pwExports;`;
	} else if (lastExpr === undefined) {
		body = evalCode + '\n;throw new Error("add a final expression — nothing to output");';
	} else {
		const rawText = evalCode.slice(lastExpr.start, lastExpr.end);
		exprText = rawText.replace(/;\s*$/, "");
		body =
			"const __pwExports = {};\n" +
			evalCode.slice(0, lastExpr.start) +
			"__pwExports.value = (() => { return " +
			exprText +
			"; })();\n" +
			evalCode.slice(lastExpr.end) +
			"\nreturn __pwExports;";
	}
	return {
		body,
		consts,
		declaredNames,
		exprText,
		evalCode,
		imports: base.imports,
		exportNames: base.exportNames,
		defaultExportName: base.defaultExportName,
	};
}

/**
 * Classify how the build-time pass would treat the result expression:
 * - every literal/resolvable node -> FULL (the vite pass eliminates it),
 * - one dynamic conditional with resolvable branches -> PARTIAL,
 * - anything referencing unknown runtime values -> RUNTIME.
 * Calls to the style helpers are transparent (their arguments are what matters).
 */
const FOLD_CALL_NAMES = new Set(["cx", "tw", "css", "class", "group", "raw", "vars", "props"]);

function isStaticNode(node: unknown, consts: ConstantScope): boolean {
	const n = node as { type?: string; name?: string } | null;
	if (n === null || n === undefined || typeof n !== "object") return true;
	switch (n.type) {
		case NodeKind.Literal:
			return true;
		case NodeKind.Identifier:
			return n.name === "undefined" || consts.has(n.name ?? "");
		case NodeKind.ObjectExpression:
			return (
				(n as { properties?: Array<{ type?: string; value?: unknown }> }).properties ?? []
			).every((prop) => prop.type === NodeKind.Property && isStaticNode(prop.value, consts));
		case NodeKind.ArrayExpression:
			return ((n as { elements?: Array<unknown> }).elements ?? []).every((el) =>
				isStaticNode(el, consts),
			);
		case NodeKind.TemplateLiteral:
			return ((n as { expressions?: Array<unknown> }).expressions ?? []).every((ex) =>
				isStaticNode(ex, consts),
			);
		case NodeKind.UnaryExpression:
			return isStaticNode((n as { argument?: unknown }).argument, consts);
		case NodeKind.ConditionalExpression: {
			const parts = n as { test?: unknown; consequent?: unknown; alternate?: unknown };
			return (
				isStaticNode(parts.test, consts) &&
				isStaticNode(parts.consequent, consts) &&
				isStaticNode(parts.alternate, consts)
			);
		}
		case NodeKind.LogicalExpression: {
			const parts = n as { left?: unknown; right?: unknown };
			return isStaticNode(parts.left, consts) && isStaticNode(parts.right, consts);
		}
		case NodeKind.BinaryExpression: {
			const parts = n as { left?: unknown; right?: unknown };
			return isStaticNode(parts.left, consts) && isStaticNode(parts.right, consts);
		}
		case NodeKind.CallExpression: {
			const call = n as { callee?: { type?: string; name?: string }; arguments?: Array<unknown> };
			if (FOLD_CALL_NAMES.has(staticCallName(call.callee) ?? "")) {
				return (call.arguments ?? []).every((arg) => isStaticNode(arg, consts));
			}
			return false;
		}
		default:
			return false;
	}
}

function classifyFold(
	exprText: string,
	consts: ConstantScope,
): { fold: "full" | "partial" | "runtime"; note: string } {
	const parsed = parseSync("fold.tsx", exprText, { sourceType: "module", lang: "tsx" });
	const statement = parsed.program.body[0];
	if (statement === undefined || statement.type !== NodeKind.ExpressionStatement) {
		return { fold: "runtime", note: "no expression to analyze" };
	}
	const expr = statement.expression;
	if (isStaticNode(expr, consts)) {
		return { fold: "full", note: "all arguments static — fully eliminated at build time" };
	}
	const t = expr.type;
	if (t === "ConditionalExpression" || t === "LogicalExpression") {
		return { fold: "partial", note: "dynamic conditional kept — static branches folded" };
	}
	if (isStaticNode(expr, consts)) {
		return { fold: "full", note: "all arguments static — fully eliminated at build time" };
	}
	// Partial folding (mirrors the vite pass): ONE dynamic conditional whose
	// branches resolve statically, possibly among otherwise-static arguments
	// inside a tw/css/cx call chain.
	let dynamicConditionals = 0;
	let sawFoldCall = false;
	let partialEligible = true;
	const visit = (node: unknown): void => {
		const n = node as { type?: string; name?: string; operator?: string } | null;
		if (n === null || typeof n !== "object") return;
		switch (n.type) {
			case NodeKind.Literal:
				return;
			case NodeKind.Identifier:
				if (n.name !== "undefined" && !consts.has(n.name ?? "")) partialEligible = false;
				return;
			case NodeKind.ObjectExpression: {
				for (const prop of ((n as { properties?: Array<{ value?: unknown }> }).properties ??
					[]) as Array<{ value?: unknown }>) {
					visit(prop.value);
				}
				return;
			}
			case NodeKind.ArrayExpression: {
				for (const el of (n as { elements?: Array<unknown> }).elements ?? []) visit(el);
				return;
			}
			case NodeKind.TemplateLiteral: {
				for (const ex of (n as { expressions?: Array<unknown> }).expressions ?? []) visit(ex);
				return;
			}
			case NodeKind.UnaryExpression:
				visit((n as { argument?: unknown }).argument);
				return;
			case NodeKind.BinaryExpression: {
				const parts = n as { left?: unknown; right?: unknown };
				visit(parts.left);
				visit(parts.right);
				return;
			}
			case NodeKind.ConditionalExpression: {
				dynamicConditionals++;
				const parts = n as { consequent?: unknown; alternate?: unknown };
				visit(parts.consequent);
				visit(parts.alternate);
				return;
			}
			case NodeKind.LogicalExpression: {
				const parts = n as { operator?: string; left?: unknown; right?: unknown };
				if (parts.operator === "&&") {
					// kept-dynamic test + static right side is fine
					visit(parts.right);
				} else {
					dynamicConditionals++;
					visit(parts.left);
					visit(parts.right);
				}
				return;
			}
			case NodeKind.CallExpression: {
				const call = n as { callee?: { type?: string; name?: string }; arguments?: Array<unknown> };
				if (FOLD_CALL_NAMES.has(staticCallName(call.callee) ?? "")) {
					sawFoldCall = true;
					for (const arg of call.arguments ?? []) visit(arg);
					return;
				}
				partialEligible = false;
				return;
			}
			default:
				partialEligible = false;
		}
	};
	visit(expr);
	if (sawFoldCall && partialEligible && dynamicConditionals <= 1) {
		return { fold: "partial", note: "dynamic conditional kept — static branches folded" };
	}
	return { fold: "runtime", note: "contains values only known at runtime" };
}

function classifySourceFold(
	source: string,
	consts: ConstantScope,
): { fold: "full" | "partial" | "runtime"; note: string } | undefined {
	try {
		const parsed = parseSync("fold-source.tsx", source, { sourceType: "module", lang: "tsx" });
		const results: Array<{ fold: "full" | "partial" | "runtime"; note: string }> = [];
		const visit = (node: unknown): void => {
			if (Array.isArray(node)) {
				for (const value of node) visit(value);
				return;
			}
			if (node === null || typeof node !== "object") return;
			const current = node as { type?: string; start?: number; end?: number; callee?: unknown };
			if (
				current.type === NodeKind.CallExpression &&
				FOLD_CALL_NAMES.has(staticCallName(current.callee) ?? "") &&
				typeof current.start === "number" &&
				typeof current.end === "number"
			) {
				results.push(classifyFold(source.slice(current.start, current.end), consts));
			}
			for (const value of Object.values(node as Record<string, unknown>)) visit(value);
		};
		visit(parsed.program);
		if (results.length === 0) return undefined;
		if (results.some((result) => result.fold === "runtime")) {
			return {
				fold: "runtime",
				note: "a rendered style call contains values only known at runtime",
			};
		}
		if (results.some((result) => result.fold === "partial")) {
			return { fold: "partial", note: "dynamic conditionals remain; their static branches fold" };
		}
		return { fold: "full", note: "rendered style calls are fully eliminated at build time" };
	} catch {
		return undefined;
	}
}

const STYLE_CALL_NAMES = new Set(["tw", "css", "class", "raw", "vars", "props"]);

function staticCallName(callee: unknown): string | undefined {
	const node = callee as {
		type?: string;
		name?: string;
		computed?: boolean;
		property?: { type?: string; name?: string; value?: string | number };
	};
	if (node?.type === NodeKind.Identifier) return node.name;
	if (
		node?.type === NodeKind.MemberExpression &&
		node.computed !== true &&
		node.property?.type === NodeKind.Identifier
	)
		return node.property.name;
	return undefined;
}

/** Build the inspectable neutral IR from object literals in the final call. */
function styleProgramsFromExpression(exprText: string): StyleProgram[] {
	const programs: StyleProgram[] = [];
	try {
		const parsed = parseSync("playground-style-program.tsx", exprText, {
			sourceType: "module",
			lang: "tsx",
		});
		const visit = (node: unknown): void => {
			if (Array.isArray(node)) {
				for (const item of node) visit(item);
				return;
			}
			if (node === null || typeof node !== "object") return;
			const current = node as {
				type?: string;
				callee?: unknown;
				arguments?: Array<{ type?: string; start?: number; end?: number }>;
			};
			if (current.type === NodeKind.CallExpression) {
				const name = staticCallName(current.callee);
				const argument = current.arguments?.[0];
				if (
					name !== undefined &&
					STYLE_CALL_NAMES.has(name) &&
					argument?.type === NodeKind.ObjectExpression &&
					typeof argument.start === "number" &&
					typeof argument.end === "number"
				) {
					const body = exprText.slice(argument.start + 1, argument.end - 1);
					try {
						programs.push(
							styleProgramFromSourceObject(body, {
								source: {
									file: "playground.tsx",
									adapter: "yumcss-playground",
									pattern: name,
								},
							}),
						);
					} catch {
						// The runtime result remains useful when an experimental object
						// shape is not representable by the semantic parser yet.
					}
				}
			}
			for (const value of Object.values(node as Record<string, unknown>)) visit(value);
		};
		visit(parsed.program);
	} catch {
		// The evaluator already reports execution errors; inspection is additive.
	}
	return programs;
}

type PlaygroundCallable = (...args: Array<never>) => unknown;

export interface EvalInput {
	code: string;
	tw: PlaygroundCallable;
	css: PlaygroundCallable;
	cx: (...inputs: Array<never>) => string;
	/** Safe preset-bound factory used when resolving `yumcss/css` imports. */
	createCss?: PlaygroundCallable;
	/** Explicit unsafe engine used when resolving `yumcss/unsafe/css` imports. */
	createUnsafeCss?: PlaygroundCallable;
	/** Explicit playground adapter; null selects YumCSS's default atomic output. */
	classNameStrategy?: ClassNameStrategy | null;
	/**
	 * Extra module bindings: sandbox import rewrites (yumcss/preset ->
	 * presetApi, ./brand.ts -> evaluated sibling tab) land here by specifier.
	 */
	moduleBindings?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
	/** Optional explicit sandbox binding used by evaluator regression tests. */
	props?: Record<string, unknown>;
	/**
	 * Resolves a css() literal style object into final declarations
	 * (design-layer resolution against the preset tokens).
	 */
	resolveCss?: (style: Record<string, unknown>) => Record<string, string>;
}

interface RuntimeCssInstance {
	readonly strategy: string;
	readonly sheetBacked: boolean;
	readonly sheet: {
		css: () => string;
		snapshot: () => {
			tokens: string;
			rules: Array<{ id: string; css: string; priority: number }>;
		};
	};
}

const isStyleRecord = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === "object" && !Array.isArray(value);

const isPlaygroundCallable = (value: unknown): value is PlaygroundCallable =>
	typeof value === "function";

const hostStyleFromResult = (result: unknown): Record<string, string> => {
	if (!isStyleRecord(result) || !isStyleRecord(result.style)) return {};
	const style: Record<string, string> = {};
	for (const [property, value] of Object.entries(result.style)) style[property] = String(value);
	return style;
};

const isCompilableStyleInput = (value: unknown): value is Record<string, unknown> => {
	if (!isStyleRecord(value)) return false;
	if (value["$$css"] === true || "compiled" in value || "className" in value) return false;
	return !("style" in value && "class" in value);
};

const styleMappingsFromCompiled = (
	styles: Array<unknown>,
	compiled: unknown,
	resolveStyle?: (style: Record<string, unknown>) => Record<string, string>,
): PlaygroundStyleMapping[] => {
	if (!isStyleRecord(compiled)) return [];
	const flat = Object.assign(
		{},
		...styles.filter(isStyleRecord).map((style) => flattenStyle(style as never)),
	);
	const resolved = Object.assign(
		{},
		...(resolveStyle === undefined
			? []
			: styles.filter(isStyleRecord).map((style) => {
					try {
						return resolveStyle(style);
					} catch {
						return {};
					}
				})),
	);
	const mappings: PlaygroundStyleMapping[] = [];
	for (const [path, className] of Object.entries(compiled)) {
		const value = flat[path] ?? resolved[path];
		if (typeof className !== "string" || value === undefined) continue;
		const parts = path.split("__");
		mappings.push({
			className,
			property: parts.at(-1) ?? path,
			value: String(value),
			conditions: parts.slice(0, -1),
			active: false,
		});
	}
	return mappings;
};

const dedupeStyleMappings = (mappings: PlaygroundStyleMapping[]): PlaygroundStyleMapping[] => {
	const seen = new Set<string>();
	return mappings.filter((mapping) => {
		const key = [mapping.className, mapping.property, mapping.value, ...mapping.conditions].join(
			"\u0000",
		);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
};

interface TwStyleEntry {
	property: string;
	value: string;
	conditions: string[];
}

function twStyleEntries(style: Record<string, unknown>, conditions: string[] = []): TwStyleEntry[] {
	const entries: TwStyleEntry[] = [];
	for (const [property, value] of Object.entries(style)) {
		if (isStyleRecord(value)) {
			entries.push(...twStyleEntries(value, [...conditions, property]));
			continue;
		}
		if (value === false || value === null || value === undefined) continue;
		const values = Array.isArray(value) ? value : [value];
		for (const part of values) {
			if (part === false || part === null || part === undefined) continue;
			entries.push({ property, value: part === true ? "" : String(part), conditions });
		}
	}
	return entries;
}

function twStyleMappings(
	style: Record<string, unknown>,
	output: unknown,
): PlaygroundStyleMapping[] {
	if (typeof output !== "string") return [];
	const entries = twStyleEntries(style);
	const classes = splitClasses(output);
	// Conflict merging and compound utilities can change the cardinality. Only
	// expose a pair when the compiler gives us an unambiguous one-to-one result.
	if (entries.length !== classes.length) return [];
	return entries.map((entry, index) => ({
		...entry,
		className: classes[index]!,
		active: false,
	}));
}

function instrumentRuntimeCss(
	instance: unknown,
	onStyleMappings: (mappings: PlaygroundStyleMapping[]) => void,
	resolveStyle?: (style: Record<string, unknown>) => Record<string, string>,
	onRuntimeStyle?: (style: Record<string, string>) => void,
): unknown {
	if (!isPlaygroundCallable(instance)) return instance;
	const callable = instance;
	const instrumented = ((...args: Array<unknown>) => {
		const result = callable(...(args as never[]));
		if (args.every(isCompilableStyleInput))
			onStyleMappings(styleMappingsFromCompiled(args, result, resolveStyle));
		return result;
	}) as ((...args: Array<unknown>) => unknown) & Record<string, unknown>;
	for (const [key, value] of Object.entries(instance)) {
		const property: unknown = value;
		if (!isPlaygroundCallable(property)) {
			instrumented[key] = property;
			continue;
		}
		instrumented[key] = (...args: Array<unknown>) => {
			const result = property(...(args as never[]));
			if (key === "vars" || key === "props") onRuntimeStyle?.(hostStyleFromResult(result));
			const styleArgs = args.filter(isCompilableStyleInput);
			if (
				(key === "class" || key === "vars" || key === "props") &&
				styleArgs.length === args.length
			) {
				const compiled = callable(...(styleArgs as never[]));
				onStyleMappings(styleMappingsFromCompiled(styleArgs, compiled, resolveStyle));
			}
			return result;
		};
	}
	return instrumented;
}

/** Evaluate playground code. Throws nothing — errors come back as data. */
export function evalPlayground(input: EvalInput): PlaygroundResult {
	return evalGuarded(input, "entry");
}

/** Builtins the sandbox injects; a module-local declaration shadows them. */
const SANDBOX_BUILTINS = ["tw", "css", "cx", "createCx", "createUnsafeCss"] as const;

function sandboxNames(prepared: Prepared, input?: EvalInput): string[] {
	return dedupe([
		...SANDBOX_BUILTINS.filter((name) => !prepared.declaredNames.includes(name)),
		...(input?.props !== undefined && !prepared.declaredNames.includes("props") ? ["props"] : []),
		...prepared.imports.map((imp) => imp.local),
	]);
}

/**
 * Evaluate a sibling tab in module mode and return its exported bindings.
 * Errors come back as a thrown Error so the caller can surface which tab
 * failed; the result shape is the raw export record, not a PlaygroundResult.
 */
export function evalSiblingModule(input: EvalInput): Record<string, unknown> {
	const code = input.code.trim();
	if (code === "") throw new Error("nothing to evaluate");
	const prepared = prepare(code, "module");
	const sandbox = buildSandbox(input, prepared, input.tw, input.css, input.cx);
	const names = sandboxNames(prepared, input);
	const fn = new Function(
		"__pw",
		`"use strict";\nconst { ${names.join(", ")} } = __pw;\n${prepared.body}`,
	);
	return (fn(sandbox) ?? {}) as Record<string, unknown>;
}

function evalGuarded(input: EvalInput, mode: EvalMode): PlaygroundResult {
	try {
		return runOnce(input, mode);
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}

/**
 * The yumcss public API surface the sandbox can resolve imports against.
 * Kept as a function so the record reflects the exact bindings this input
 * carries the safe and unsafe CSS factories when available.
 */
function yumcssBuiltins(input: EvalInput): Record<string, unknown> {
	return {
		tw: input.tw,
		css: input.css,
		cx: input.cx,
		createCx: () => input.cx,
		createCss: input.createCss,
		createUnsafeCss: input.createUnsafeCss,
	};
}

/**
 * Build the sandbox scope shared by entry and module evaluation: the
 * instrumented builtin bindings plus one entry per resolved import. Builtin
 * defaults always exist so bare-call snippets work without an import.
 */
function buildSandbox(
	input: EvalInput,
	prepared: Prepared,
	tw: PlaygroundCallable,
	css: EvalInput["css"],
	cx: (...inputs: Array<never>) => string,
	onRuntimeCss?: (instance: RuntimeCssInstance) => void,
	onStyleMappings?: (mappings: PlaygroundStyleMapping[]) => void,
	onRuntimeStyle?: (style: Record<string, string>) => void,
): Record<string, unknown> {
	const sandbox: Record<string, unknown> = {
		tw,
		css,
		cx,
		createCx: () => cx,
		createCss: input.createCss,
		createUnsafeCss: input.createUnsafeCss,
		jsx: createPlaygroundJsx,
		Fragment: PLAYGROUND_FRAGMENT,
	};
	const instrumentedBuiltins: Record<string, unknown> = {
		tw,
		css,
		cx,
		createCx: () => cx,
		createCss: input.createCss,
		createUnsafeCss: input.createUnsafeCss,
	};
	if (input.props !== undefined) {
		sandbox.props = input.props;
		instrumentedBuiltins.props = input.props;
	}
	for (const imp of prepared.imports) {
		const bindings = input.moduleBindings?.[imp.source];
		if (bindings !== undefined) {
			const imported = imp.imported === undefined ? undefined : bindings[imp.imported];
			const resolvedImport =
				imported ??
				(imp.imported !== undefined && imp.source.startsWith("yumcss/")
					? yumcssBuiltins(input)[imp.imported]
					: undefined);
			const isCssFactory = imp.source === "yumcss/css" && imp.imported === "createCss";
			const isUnsafeCssFactory =
				imp.source === "yumcss/unsafe/css" && imp.imported === "createUnsafeCss";
			const isDesignFactory =
				imp.source === "yumcss/design" && imp.imported === "createDesignCss";
			const isRuntimeFactory =
				typeof resolvedImport === "function" &&
				((imp.source === "yumcss/css/runtime" &&
					(imp.imported === "createRuntimeCss" || imp.imported === "createRuntimeDesignCss")) ||
					isCssFactory ||
					isUnsafeCssFactory ||
					isDesignFactory);
			if (isRuntimeFactory) {
				sandbox[imp.local] = (...args: Array<unknown>) => {
					const firstArgument =
						args[0] !== null && typeof args[0] === "object"
							? (args[0] as Record<string, unknown>)
							: undefined;
					const isPresetArgument =
						isCssFactory &&
						firstArgument !== undefined &&
						"conditions" in firstArgument &&
						"properties" in firstArgument &&
						"strict" in firstArgument;
					const optionArgument = isCssFactory
						? isPresetArgument
							? args[1]
							: args[0]
						: isUnsafeCssFactory
							? args[0]
							: args[1];
					const authoredOptions =
						optionArgument !== null && typeof optionArgument === "object"
							? (optionArgument as Record<string, unknown>)
							: {};
					const authoredSheetOptions =
						authoredOptions.sheetOptions !== null &&
						typeof authoredOptions.sheetOptions === "object"
							? (authoredOptions.sheetOptions as Record<string, unknown>)
							: {};
					const effectiveOptions =
						input.classNameStrategy === undefined
							? authoredOptions
							: {
									...authoredOptions,
									className: input.classNameStrategy ?? undefined,
								};
					const runtimeOptions = {
						...effectiveOptions,
						sheetOptions: { ...authoredSheetOptions, autoMount: false },
					};
					const factoryArgs = isCssFactory
						? isPresetArgument
							? [args[0], runtimeOptions]
							: [runtimeOptions]
						: isUnsafeCssFactory
							? [runtimeOptions]
							: [
									args[0],
									{
										...effectiveOptions,
										sheetOptions: { ...authoredSheetOptions, autoMount: false },
									},
								];
					const instance = (resolvedImport as (...values: Array<unknown>) => unknown)(
						...factoryArgs,
					) as RuntimeCssInstance | undefined;
					const instrumented = instrumentRuntimeCss(
						instance,
						(mappings) => {
							onStyleMappings?.(mappings);
						},
						input.resolveCss,
						onRuntimeStyle,
					);
					if (
						instrumented !== null &&
						typeof instrumented === "function" &&
						(instance as RuntimeCssInstance | undefined)?.sheet !== undefined &&
						typeof (instance as RuntimeCssInstance).sheet.css === "function" &&
						typeof (instance as RuntimeCssInstance).sheet.snapshot === "function"
					) {
						const className = effectiveOptions.className;
						const classNameRecord =
							className !== null && typeof className === "object"
								? (className as Record<string, unknown>)
								: undefined;
						onRuntimeCss?.({
							strategy: typeof classNameRecord?.name === "string" ? classNameRecord.name : "atomic",
							sheetBacked: classNameRecord === undefined || classNameRecord.sheetBacked === true,
							sheet: (instance as RuntimeCssInstance).sheet,
						});
					}
					return instrumented;
				};
			} else {
				sandbox[imp.local] = imp.imported === undefined ? bindings : resolvedImport;
			}
			continue;
		}
		// yumcss's own public API resolves against the sandbox builtins:
		// `import { tw } from "yumcss"` is the same tw the file already has.
		if (imp.source === "yumcss" || imp.source.startsWith("yumcss/")) {
			if (imp.imported !== undefined) {
				sandbox[imp.local] = instrumentedBuiltins[imp.imported];
			} else {
				// Default imports are not part of the supported YumCSS entrypoints.
				sandbox[imp.local] =
					imp.source === "yumcss" ? instrumentedBuiltins : input.createUnsafeCss;
			}
			continue;
		}
		if (imp.source.startsWith("./")) {
			throw new Error(
				`import "${imp.source}" — no sibling tab provides this module in the playground`,
			);
		}
		throw new Error(`import "${imp.source}" is not available in the playground sandbox`);
	}
	for (const [local, value] of Object.entries(sandbox)) {
		if (
			local === "tw" ||
			local === "css" ||
			local === "cx" ||
			local === "createCx" ||
			local === "props" ||
			local === "createCss" ||
			local === "createUnsafeCss" ||
			local === "jsx" ||
			local === "Fragment"
		)
			continue;
		if (value === undefined) {
			throw new Error(`the import "${local}" is not available in the playground sandbox`);
		}
	}
	return sandbox;
}

function runOnce(input: EvalInput, mode: EvalMode): PlaygroundResult {
	const code = input.code.trim();
	if (code === "") return { ok: false, error: "nothing to evaluate" };

	const prepared = prepare(code, mode);
	const exprText = prepared.exprText;
	// Sibling imports that resolve to scalars are known constants for the
	// fold classifier: the vite pass evaluates the real sibling module, so
	// a statically-known brand tone folds exactly like a local const.
	for (const imp of prepared.imports) {
		if (imp.imported === undefined || prepared.consts.has(imp.local)) continue;
		const value = input.moduleBindings?.[imp.source]?.[imp.imported];
		// StaticEval = CxInput: strings (and class records) are foldable
		// constants; numbers/booleans are not cx inputs.
		if (typeof value === "string") {
			prepared.consts.set(imp.local, { value, declStart: -1 });
		}
	}

	// Instrumented bindings: record every token entering any call.
	const inputs: string[] = [];
	const recordTokens = (out: unknown): void => {
		if (typeof out === "string") inputs.push(...splitClasses(out));
	};
	const recordArgs = (args: Array<unknown>): void => {
		for (const arg of args) {
			if (typeof arg === "string") inputs.push(...splitClasses(arg));
			else if (Array.isArray(arg))
				for (const nested of arg) {
					if (typeof nested === "string") inputs.push(...splitClasses(nested));
				}
		}
	};
	const tw = (...args: Array<unknown>) => {
		recordArgs(args);
		const result = input.tw(...(args as never[]));
		recordTokens(result);
		if (args.length === 1 && isStyleRecord(args[0]))
			styleMappings.push(...twStyleMappings(args[0], result));
		return result;
	};
	const atomDeclarations: Array<{ cls: string; decls: Record<string, string> }> = [];
	const runtimeInstances: RuntimeCssInstance[] = [];
	const styleMappings: PlaygroundStyleMapping[] = [];
	const runtimeStyle: Record<string, string> = {};
	/**
	 * Instrumented css() binding. The wrapper exposes the SAME surface as the
	 * real css() (callable plus every namespaced method the instance carries:
	 * class / raw / vars / props / group / input), so sandbox code can use the
	 * full documented API without crashing on a partial runtime adapter.
	 */
	const cssCall =
		(method?: string) =>
		(...args: Array<unknown>): unknown => {
			recordArgs(args);
			const fn: unknown =
				method === undefined
					? input.css
					: Object.getOwnPropertyDescriptor(input.css, method)?.value;
			if (!isPlaygroundCallable(fn))
				throw new Error(`css.${method} is not available in the sandbox`);
			const result = fn(...(args as never[]));
			if (method === "vars" || method === "props") {
				Object.assign(runtimeStyle, hostStyleFromResult(result));
			}
			recordTokens(result);
			const styleArgs = args.filter(isCompilableStyleInput);
			const compiled =
				method === undefined
					? result
					: (method === "class" || method === "vars" || method === "props") &&
						  styleArgs.length === args.length
						? input.css(...(styleArgs as never[]))
						: undefined;
			styleMappings.push(...styleMappingsFromCompiled(styleArgs, compiled, input.resolveCss));
			if (
				args.length > 0 &&
				typeof args[0] === "object" &&
				args[0] !== null &&
				input.resolveCss !== undefined
			) {
				const resolved = input.resolveCss(args[0] as Record<string, unknown>);
				if (resolved !== undefined && Object.keys(resolved).length > 0) {
					if (typeof result === "string") {
						atomDeclarations.push({ cls: result, decls: resolved });
					} else if (result !== null && typeof result === "object") {
						// Bare css() returns { designProp -> atom class }; each entry
						// is one generated atom alongside its resolved declaration.
						for (const [prop, cls] of Object.entries(result as Record<string, unknown>)) {
							const value = (resolved as Record<string, unknown>)[prop];
							if (typeof value !== "string") continue;
							atomDeclarations.push({
								cls: String(cls),
								decls: { [prop]: value },
							});
						}
					}
				}
			}
			return result;
		};
	const css: EvalInput["css"] = cssCall();
	const cssMethods: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(input.css)) {
		const method: unknown = value;
		if (isPlaygroundCallable(method)) cssMethods[key] = cssCall(key);
	}
	Object.assign(css, cssMethods);
	const cx = (...callInputs: Array<never>) => {
		recordArgs(callInputs);
		const result = input.cx(...callInputs);
		inputs.push(...splitClasses(result));
		return result;
	};

	// One sandbox record: builtins plus every import binding share a single
	// destructured scope inside the evaluated body. Builtin defaults stay so
	// bare-call tests and quick snippets keep working without an import.
	const sandbox = buildSandbox(
		input,
		prepared,
		tw,
		css,
		cx,
		(instance) => {
			runtimeInstances.push(instance);
		},
		(mappings) => {
			styleMappings.push(...mappings);
		},
		(style) => {
			Object.assign(runtimeStyle, style);
		},
	);
	let captured: { value?: unknown } = {};
	// One destructured scope for every module: builtins filtered by local
	// shadows plus import bindings, so an example's own `const css` wins.
	const names = sandboxNames(prepared, input);
	const fn = new Function(
		"__pw",
		`"use strict";\nconst { ${names.join(", ")} } = __pw;\n${prepared.body}`,
	);
	captured = (fn(sandbox) ?? {}) as { value?: unknown };

	// The entry value may be a class string, a declaration map (plain
	// css() / css.raw()), a { class, style } pair from css.vars(), or a
	// component tree produced by the playground JSX runtime.
	const rawValue = captured.value;
	const entryValue =
		prepared.defaultExportName !== undefined && typeof rawValue === "function"
			? createPlaygroundJsx(rawValue, input.props ?? {})
			: rawValue;
	let output: string | undefined;
	let rendered: PlaygroundNode | undefined;
	let decls: Record<string, string> | undefined;
	let varsOutput: { class: string; style: Record<string, string> } | undefined;
	let propsOutput: { className?: string; style?: Record<string, string> } | undefined;
	if (entryValue !== null && typeof entryValue === "object" && isPlaygroundNode(entryValue)) {
		rendered = entryValue;
		const styledClasses = new Set([
			...inputs,
			...styleMappings.map((mapping) => mapping.className),
		]);
		const styledHost =
			findPlaygroundStyledHost(entryValue, styledClasses) ?? findPlaygroundClassHost(entryValue);
		if (styledHost !== undefined) {
			const className = styledHost.props.className;
			const style = styledHost.props.style;
			propsOutput = {
				className: typeof className === "string" ? className : undefined,
				style:
					style !== null && typeof style === "object"
						? Object.fromEntries(Object.entries(style).map(([key, value]) => [key, String(value)]))
						: undefined,
			};
			output = typeof className === "string" ? className : "";
		}
	} else if (typeof entryValue === "string") {
		output = entryValue;
	} else if (entryValue !== null && typeof entryValue === "object") {
		const candidate = entryValue as Record<string, unknown>;
		if (
			typeof candidate.class === "string" &&
			candidate.style !== null &&
			typeof candidate.style === "object"
		) {
			const style: Record<string, string> = {};
			for (const [key, value] of Object.entries(candidate.style as Record<string, unknown>)) {
				style[key] = String(value);
			}
			varsOutput = { class: candidate.class, style };
			output = candidate.class;
		} else if (typeof candidate.className === "string") {
			propsOutput = {
				className: candidate.className,
				style: candidate.style as Record<string, string> | undefined,
			};
			output = candidate.className;
		} else if (Object.values(candidate).every((value) => typeof value !== "object")) {
			decls = {};
			for (const [key, value] of Object.entries(candidate)) decls[key] = String(value);
		}
	}
	if (output === undefined && decls === undefined && rendered === undefined) {
		return {
			ok: false,
			error:
				"the entry value did not produce a renderable component, class string, or declaration object",
		};
	}

	const finalClass = output ?? "";
	const survived = splitClasses(finalClass);
	const uniqueIn = dedupe(inputs);
	const killed = dedupe(uniqueIn.filter((token) => !survived.includes(token)));
	const foldInfo =
		classifySourceFold(prepared.evalCode, prepared.consts) ??
		classifyFold(exprText, prepared.consts);
	const sheets = runtimeInstances
		.filter((instance) => instance.sheetBacked)
		.map((instance) => {
			const snapshot = instance.sheet.snapshot();
			return {
				strategy: instance.strategy,
				css: instance.sheet.css(),
				tokens: snapshot.tokens,
				rules: snapshot.rules,
			};
		});

	const success: PlaygroundSuccess = {
		ok: true,
		execution: {
			lane: PLAYGROUND_EXECUTION_LANE.Sandbox,
			scope: PLAYGROUND_EXECUTION_SCOPE.BrowserEvaluator,
			verified: [
				PLAYGROUND_EVIDENCE_CHECK.RuntimeEvaluation,
				PLAYGROUND_EVIDENCE_CHECK.StyleProgramExtraction,
				...(sheets.length > 0 ? [PLAYGROUND_EVIDENCE_CHECK.RuntimeSheetCss] : []),
			],
			unavailable: [
				PLAYGROUND_EVIDENCE_CHECK.ProjectTypecheck,
				PLAYGROUND_EVIDENCE_CHECK.ProjectBuild,
				PLAYGROUND_EVIDENCE_CHECK.BrowserHost,
				PLAYGROUND_EVIDENCE_CHECK.SsrBuild,
				PLAYGROUND_EVIDENCE_CHECK.Hydration,
			],
			note: "This result runs in the browser sandbox; it does not execute a host project pipeline.",
		},
		output: finalClass,
		tokensIn: uniqueIn,
		survived: dedupe(survived),
		killed,
		fold: foldInfo.fold,
		foldNote: foldInfo.note,
		atomDeclarations,
		sheets,
		styleMappings: dedupeStyleMappings(styleMappings).map((mapping) => ({
			...mapping,
			active: survived.includes(mapping.className),
		})),
		programs: styleProgramsFromExpression(prepared.evalCode),
	};
	if (decls !== undefined) success.decls = decls;
	if (rendered !== undefined) success.rendered = rendered;
	if (varsOutput !== undefined) success.varsOutput = varsOutput;
	if (propsOutput !== undefined) success.propsOutput = propsOutput;
	if (Object.keys(runtimeStyle).length > 0) success.runtimeStyle = runtimeStyle;
	return success;
}
