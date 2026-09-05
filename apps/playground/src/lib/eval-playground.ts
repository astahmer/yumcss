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
import { collectModuleConstants } from "pandwind/vite/cx-inline";
import type { ConstantScope } from "pandwind/vite/cx-inline";
import { NodeKind, ImportKindTag } from "pandwind/tw/literal";

interface PlaygroundSuccess {
	ok: true;
	/** The merged class string produced by the runtime. */
	output: string;
	/**
	 * Declaration map when the final expression returned one (plain css() /
	 * css.raw()); the class-string pane is replaced by a declarations pane.
	 */
	decls?: Record<string, string>;
	/** Class + inline-style pair from a css.vars() result. */
	varsOutput?: { class: string; style: Record<string, string> };
	/** Resolved React-style host props from a css.props() result. */
	propsOutput?: { className?: string; style?: Record<string, string> };
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
}

export type PlaygroundResult = PlaygroundSuccess | { ok: false; error: string };

const splitClasses = (value: string): string[] => value.split(/\s+/).filter(Boolean);

const dedupe = (values: Array<string>): string[] => [...new Set(values)];

interface Prepared {
	body: string;
	consts: ConstantScope;
	exprText: string;
	/** Rewritten module source (imports removed, export markers unwrapped). */
	evalCode: string;
	/** Value imports collected from the stripped file. */
	imports: Array<{ local: string; source: string; imported?: string }>;
	/** Module-level names this file exports (sandbox export surface). */
	exportNames: Array<string>;
	/** Span of the final expression statement, if present. */
	lastExpr?: { start: number; end: number };
	/** Module-level names the file declares itself (they shadow builtins). */
	declaredNames: Array<string>;
}

/**
 * Parse the full module once and classify every top-level statement:
 * imports are collected (never executed), export markers are unwrapped, and
 * the last top-level expression statement is located as the result. Type-only
 * suffixes ("as const", "satisfies X") keep their expression and drop the
 * annotation span, so typed example source still runs untransformed.
 */
function stripModule(code: string): Omit<Prepared, "body" | "consts" | "exprText"> {
	const parsed = parseSync("module-syntax.tsx", code, { sourceType: "module", lang: "tsx" });
	const statements = ((parsed.program as unknown as { body?: unknown }).body ?? []) as Array<
		{
			type: string;
			start: number;
			end: number;
			source?: { value?: string };
			specifiers?: Array<{
				type: string;
				local?: { name?: string };
				imported?: { name?: string; value?: string };
				importKind?: string;
			}>;
			importKind?: string;
			declaration?: { type?: string; declarations?: Array<{ id?: { name?: string } }> };
		} & Record<string, unknown>
	>;
	const imports: Prepared["imports"] = [];
	const exportNames: Array<string> = [];
	const cuts: Array<[number, number]> = [];
	const unwraps: Array<[number, number]> = [];
	// Type-only suffixes ("as const", "satisfies X") keep their expression
	// and drop the annotation span, so typed example source still runs
	// untransformed inside new Function.
	const walk = (node: unknown): void => {
		if (Array.isArray(node)) {
			for (const item of node) walk(item);
			return;
		}
		if (node === null || typeof node !== "object") return;
		const n = node as { type?: string; end?: number; expression?: { end?: number } };
		if (n.type === NodeKind.TSAsExpression || n.type === NodeKind.TSSatisfiesExpression) {
			const inner = n.expression;
			if (typeof inner?.end === "number" && typeof n.end === "number")
				cuts.push([inner.end, n.end]);
		}
		for (const value of Object.values(node as Record<string, unknown>)) {
			if (value !== null && typeof value === "object") walk(value);
		}
	};
	walk(parsed.program);
	for (const statement of statements) {
		if (statement.type === NodeKind.ImportDeclaration) {
			if (statement.importKind === ImportKindTag.Type) {
				cuts.push([statement.start, statement.end]);
				continue;
			}
			const source = statement.source?.value ?? "";
			for (const spec of statement.specifiers ?? []) {
				if (spec.type === NodeKind.ImportSpecifier && spec.importKind === ImportKindTag.Type)
					continue;
				const local = spec.local?.name;
				if (local === undefined) continue;
				if (spec.type === NodeKind.ImportSpecifier)
					imports.push({ local, source, imported: spec.imported?.name ?? spec.imported?.value });
				else imports.push({ local, source });
			}
			cuts.push([statement.start, statement.end]);
		} else if (
			statement.type === NodeKind.TSExportAssignment ||
			statement.type === NodeKind.ExportDefaultDeclaration
		) {
			cuts.push([statement.start, statement.end]);
		} else if (statement.type === NodeKind.ExportNamedDeclaration) {
			const inner = statement.declaration;
			if (inner === undefined) cuts.push([statement.start, statement.end]);
			else {
				unwraps.push([statement.start, statement.start + "export ".length]);
				for (const decl of inner.declarations ?? []) {
					if (decl.id?.name !== undefined) exportNames.push(decl.id.name);
				}
				if (
					inner.type === NodeKind.FunctionDeclaration &&
					(inner as { id?: { name?: string } }).id?.name
				)
					exportNames.push((inner as { id?: { name?: string } }).id!.name!);
			}
		}
	}
	// Every edit is an (original-start, original-end, replacement) triple so
	// spans stay valid: apply them in one right-to-left pass.
	const edits: Array<[number, number, string]> = [
		...cuts.map(([start, end]): [number, number, string] => [start, end, ""]),
		...unwraps.map(([start, end]): [number, number, string] => [start, end, ""]),
	].toSorted((left, right) => right[0] - left[0]);
	let evalCode = code;
	for (const [start, end] of edits) evalCode = evalCode.slice(0, start) + evalCode.slice(end);
	return { evalCode, imports, exportNames, declaredNames: [] };
}

/**
 * Parse the module, strip imports/export markers, locate the final top-level
 * expression, and collect module constants for the fold classifier.
 */
/** Evaluation modes: the entry tab wraps its final expression as the
 * result; sibling tabs run whole and hand back their exported bindings. */
type EvalMode = "entry" | "module";

function prepare(code: string, mode: EvalMode): Prepared {
	const base = stripModule(code);
	const evalCode = base.evalCode;
	const parsed = parseSync("playground.tsx", evalCode, { sourceType: "module", lang: "tsx" });
	const program = parsed.program as unknown as {
		body?: Array<{ type: string; start: number; end: number }>;
	};
	const statements = program.body ?? [];
	// Module-declared names shadow the sandbox builtins: an example that
	// says `const css = createCss()` must receive its own css, not the
	// prebuilt binding injected under the same identifier.
	const declaredNames: Array<string> = [];
	for (const statement of statements) {
		const s = statement as unknown as {
			type: string;
			declarations?: Array<{ id?: { name?: string } }>;
			id?: { name?: string };
		};
		if (s.type === NodeKind.VariableDeclaration) {
			for (const decl of s.declarations ?? []) if (decl.id?.name) declaredNames.push(decl.id.name);
		} else if (s.type === NodeKind.FunctionDeclaration || s.type === NodeKind.ClassDeclaration) {
			if (s.id?.name) declaredNames.push(s.id.name);
		}
	}
	// oxc's ExpressionStatement.end INCLUDES the trailing semicolon.
	let lastExpr: { start: number; end: number } | undefined;
	for (const statement of statements) {
		if (statement.type === NodeKind.ExpressionStatement) lastExpr = statement;
	}
	const consts = collectModuleConstants(
		parsed.program as unknown as Parameters<typeof collectModuleConstants>[0],
	);
	let body: string;
	let exprText = "";
	if (mode === "module") {
		// Sibling-tab mode: run the stripped file and return every exported
		// binding so the entry tab can import them as a real module.
		body =
			base.exportNames.length === 0
				? evalCode + "\nreturn {};"
				: evalCode +
					`\nreturn { ${base.exportNames.map((name) => `${name}: ${name}`).join(", ")} };`;
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
	};
}

/**
 * Classify how the build-time pass would treat the result expression:
 * - every literal/resolvable node -> FULL (the vite pass eliminates it),
 * - one dynamic conditional with resolvable branches -> PARTIAL,
 * - anything referencing unknown runtime values -> RUNTIME.
 * Calls to tw/css/cx are transparent (their arguments are what matters).
 */
const FOLD_CALL_NAMES = new Set(["cx", "tw", "css"]);

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
			if (
				call.callee?.type === NodeKind.Identifier &&
				FOLD_CALL_NAMES.has(call.callee.name ?? "")
			) {
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
	const statement = (parsed.program as unknown as { body: Array<Record<string, unknown>> })
		.body?.[0];
	if (statement === undefined || statement.type !== NodeKind.ExpressionStatement) {
		return { fold: "runtime", note: "no expression to analyze" };
	}
	const expr = statement.expression as { type?: string };
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
				if (
					call.callee?.type === NodeKind.Identifier &&
					FOLD_CALL_NAMES.has(call.callee.name ?? "")
				) {
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
export interface EvalInput {
	code: string;
	tw: (...args: Array<unknown>) => unknown;
	css: ((...args: Array<unknown>) => unknown) & Record<string, unknown>;
	cx: (...inputs: Array<never>) => string;
	/** Loose engine css() available as createCss() inside evaluated code. */
	createCss?: (...args: Array<unknown>) => unknown;
	/**
	 * Extra module bindings: sandbox import rewrites (pandwind/preset ->
	 * presetApi, ./brand.ts -> evaluated sibling tab) land here by specifier.
	 */
	moduleBindings?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
	/** Available inside evaluated code as `props` (component-like dynamics). */
	props?: Record<string, unknown>;
	/**
	 * Resolves a css() literal style object into final declarations
	 * (design-layer resolution against the preset tokens).
	 */
	resolveCss?: (style: Record<string, unknown>) => Record<string, string>;
}

/** Evaluate playground code. Throws nothing — errors come back as data. */
export function evalPlayground(input: EvalInput): PlaygroundResult {
	return evalGuarded(input, "entry");
}

/** Builtins the sandbox injects; a module-local declaration shadows them. */
const SANDBOX_BUILTINS = ["tw", "css", "cx", "createCx", "props", "createCss"];

function sandboxNames(prepared: Prepared): string[] {
	return dedupe([
		...SANDBOX_BUILTINS.filter((name) => !prepared.declaredNames.includes(name)),
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
	const names = sandboxNames(prepared);
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
 * The pandwind public API surface the sandbox can resolve imports against.
 * Kept as a function so the record reflects the exact bindings this input
 * carries (createCss may be absent).
 */
function pandwindBuiltins(input: EvalInput): Record<string, unknown> {
	return {
		tw: input.tw,
		css: input.css,
		cx: input.cx,
		createCx: () => input.cx,
		createCss: input.createCss,
		props: input.props,
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
	tw: (...args: Array<unknown>) => unknown,
	css: EvalInput["css"],
	cx: (...inputs: Array<never>) => string,
): Record<string, unknown> {
	const sandbox: Record<string, unknown> = {
		tw,
		css,
		cx,
		createCx: () => cx,
		props: input.props ?? {},
		createCss: input.createCss,
	};
	for (const imp of prepared.imports) {
		const bindings = input.moduleBindings?.[imp.source];
		if (bindings !== undefined) {
			sandbox[imp.local] = imp.imported === undefined ? bindings : bindings[imp.imported];
			continue;
		}
		// pandwind's own public API resolves against the sandbox builtins:
		// `import { tw } from "pandwind"` is the same tw the file already has.
		if (imp.source === "pandwind" || imp.source.startsWith("pandwind/")) {
			if (imp.imported !== undefined) {
				sandbox[imp.local] = pandwindBuiltins(input)[imp.imported];
			} else {
				// Default import: the css entry's default is the loose engine.
				sandbox[imp.local] = imp.source === "pandwind" ? pandwindBuiltins(input) : input.createCss;
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
			local === "createCss"
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
		return result;
	};
	const atomDeclarations: Array<{ cls: string; decls: Record<string, string> }> = [];
	/**
	 * Instrumented css() binding. The wrapper exposes the SAME surface as the
	 * real css() (callable plus every namespaced method the instance carries:
	 * class / raw / vars / props / group / input), so sandbox code can use the
	 * full documented API without crashing on a partial shim.
	 */
	const cssCall =
		(method?: string) =>
		(...args: Array<unknown>): unknown => {
			recordArgs(args);
			const fn =
				method === undefined ? input.css : (input.css[method] as (...a: Array<never>) => unknown);
			if (typeof fn !== "function")
				throw new Error(`css.${method} is not available in the sandbox`);
			const result = fn(...(args as never[]));
			recordTokens(result);
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
	const css = cssCall() as EvalInput["css"];
	for (const key of Object.keys(input.css)) {
		if (typeof (input.css as Record<string, unknown>)[key] === "function") {
			(css as unknown as Record<string, unknown>)[key] = cssCall(key);
		}
	}
	const cx = (...callInputs: Array<never>) => {
		recordArgs(callInputs);
		const result = input.cx(...callInputs);
		inputs.push(...splitClasses(result));
		return result;
	};

	// One sandbox record: builtins plus every import binding share a single
	// destructured scope inside the evaluated body. Builtin defaults stay so
	// bare-call tests and quick snippets keep working without an import.
	const sandbox = buildSandbox(input, prepared, tw, css, cx);
	let captured: { value?: unknown } = {};
	// One destructured scope for every module: builtins filtered by local
	// shadows plus import bindings, so an example's own `const css` wins.
	const names = sandboxNames(prepared);
	const fn = new Function(
		"__pw",
		`"use strict";\nconst { ${names.join(", ")} } = __pw;\n${prepared.body}`,
	);
	captured = (fn(sandbox) ?? {}) as { value?: unknown };

	// The final expression may be a class string, a declaration map (plain
	// css() / css.raw()), or a { class, style } pair from css.vars().
	const rawValue = captured.value;
	let output: string | undefined;
	let decls: Record<string, string> | undefined;
	let varsOutput: { class: string; style: Record<string, string> } | undefined;
	let propsOutput: { className?: string; style?: Record<string, string> } | undefined;
	if (typeof rawValue === "string") {
		output = rawValue;
	} else if (rawValue !== null && typeof rawValue === "object") {
		const candidate = rawValue as Record<string, unknown>;
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
	if (output === undefined && decls === undefined) {
		return {
			ok: false,
			error: "the final expression did not produce a class string or declaration object",
		};
	}

	const finalClass = output ?? "";
	const survived = splitClasses(finalClass);
	const uniqueIn = dedupe(inputs);
	const killed = dedupe(uniqueIn.filter((token) => !survived.includes(token)));
	const foldInfo = classifyFold(exprText, prepared.consts);

	const success: PlaygroundSuccess = {
		ok: true,
		output: finalClass,
		tokensIn: uniqueIn,
		survived: dedupe(survived),
		killed,
		fold: foldInfo.fold,
		foldNote: foldInfo.note,
		atomDeclarations,
	};
	if (decls !== undefined) success.decls = decls;
	if (varsOutput !== undefined) success.varsOutput = varsOutput;
	if (propsOutput !== undefined) success.propsOutput = propsOutput;
	return success;
}
