/**
 * Playground eval engine.
 *
 * Runs user-authored `tw(...)` / `css(...)` / `cx(...)` expressions against
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

interface PlaygroundSuccess {
	ok: true;
	/** The merged class string produced by the runtime. */
	output: string;
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
}

/** Parse + locate the last top-level expression statement (the result). */
function prepare(code: string): Prepared {
	const parsed = parseSync("playground.tsx", code, { sourceType: "module", lang: "tsx" });
	const program = parsed.program as unknown as {
		body?: Array<{ type: string; start: number; end: number }>;
	};
	const statements = program.body ?? [];
	let lastExpr: { start: number; end: number } | undefined;
	for (const statement of statements) {
		if (statement.type === "ExpressionStatement") lastExpr = statement;
	}
	const consts = collectModuleConstants(
		parsed.program as unknown as Parameters<typeof collectModuleConstants>[0],
	);
	if (lastExpr === undefined) {
		return {
			body: `${code}\n;throw new Error("add a final expression — nothing to output");`,
			consts,
			exprText: "",
		};
	}
	// oxc's ExpressionStatement.end INCLUDES the trailing semicolon - strip it
	const rawText = code.slice(lastExpr.start, lastExpr.end);
	const exprText = rawText.replace(/;\s*$/, "");
	const body = `let __pw_out;\n${code.slice(0, lastExpr.start)}__pw_out = (${exprText})${code.slice(lastExpr.end)}\nreturn __pw_out;`;
	return { body, consts, exprText };
}

/** Classify how the build-time pass would treat the result expression. */
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
		case "Literal":
			return true;
		case "Identifier":
			return n.name === "undefined" || consts.has(n.name ?? "");
		case "ObjectExpression":
			return (
				(n as { properties?: Array<{ type?: string; value?: unknown }> }).properties ?? []
			).every((prop) => prop.type === "Property" && isStaticNode(prop.value, consts));
		case "ArrayExpression":
			return ((n as { elements?: Array<unknown> }).elements ?? []).every((el) =>
				isStaticNode(el, consts),
			);
		case "TemplateLiteral":
			return ((n as { expressions?: Array<unknown> }).expressions ?? []).every((ex) =>
				isStaticNode(ex, consts),
			);
		case "UnaryExpression":
			return isStaticNode((n as { argument?: unknown }).argument, consts);
		case "ConditionalExpression": {
			const parts = n as { test?: unknown; consequent?: unknown; alternate?: unknown };
			return (
				isStaticNode(parts.test, consts) &&
				isStaticNode(parts.consequent, consts) &&
				isStaticNode(parts.alternate, consts)
			);
		}
		case "LogicalExpression": {
			const parts = n as { left?: unknown; right?: unknown };
			return isStaticNode(parts.left, consts) && isStaticNode(parts.right, consts);
		}
		case "BinaryExpression": {
			const parts = n as { left?: unknown; right?: unknown };
			return isStaticNode(parts.left, consts) && isStaticNode(parts.right, consts);
		}
		case "CallExpression": {
			const call = n as { callee?: { type?: string; name?: string }; arguments?: Array<unknown> };
			if (call.callee?.type === "Identifier" && FOLD_CALL_NAMES.has(call.callee.name ?? "")) {
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
	if (statement === undefined || statement.type !== "ExpressionStatement") {
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
			case "Literal":
				return;
			case "Identifier":
				if (n.name !== "undefined" && !consts.has(n.name ?? "")) partialEligible = false;
				return;
			case "ObjectExpression": {
				for (const prop of ((n as { properties?: Array<{ value?: unknown }> }).properties ??
					[]) as Array<{ value?: unknown }>) {
					visit(prop.value);
				}
				return;
			}
			case "ArrayExpression": {
				for (const el of (n as { elements?: Array<unknown> }).elements ?? []) visit(el);
				return;
			}
			case "TemplateLiteral": {
				for (const ex of (n as { expressions?: Array<unknown> }).expressions ?? []) visit(ex);
				return;
			}
			case "UnaryExpression":
				visit((n as { argument?: unknown }).argument);
				return;
			case "BinaryExpression": {
				const parts = n as { left?: unknown; right?: unknown };
				visit(parts.left);
				visit(parts.right);
				return;
			}
			case "ConditionalExpression": {
				dynamicConditionals++;
				const parts = n as { consequent?: unknown; alternate?: unknown };
				visit(parts.consequent);
				visit(parts.alternate);
				return;
			}
			case "LogicalExpression": {
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
			case "CallExpression": {
				const call = n as { callee?: { type?: string; name?: string }; arguments?: Array<unknown> };
				if (call.callee?.type === "Identifier" && FOLD_CALL_NAMES.has(call.callee.name ?? "")) {
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
	try {
		return runOnce(input);
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}

function runOnce(input: EvalInput): PlaygroundResult {
	const code = input.code.trim();
	if (code === "") return { ok: false, error: "nothing to evaluate" };

	const prepared = prepare(code);
	const exprText = prepared.exprText;

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
	 * Instrumented css() binding. `method` selects a namespaced variant
	 * (`.class` / `.raw`) — the wrapper must expose the SAME surface as the
	 * real css() or sandbox code calling `css.class({...})` would crash.
	 */
	const cssBinding =
		(method?: "class" | "raw") =>
		(...args: Array<unknown>): unknown => {
			recordArgs(args);
			const result =
				method === undefined
					? input.css(...(args as never[]))
					: (input.css[method] as (...a: Array<never>) => unknown)(...(args as never[]));
			recordTokens(result);
			if (
				typeof result === "string" &&
				args.length > 0 &&
				typeof args[0] === "object" &&
				args[0] !== null &&
				input.resolveCss !== undefined
			) {
				const decls = input.resolveCss(args[0] as Record<string, unknown>);
				if (decls !== undefined && Object.keys(decls).length > 0) {
					atomDeclarations.push({ cls: result, decls });
				}
			}
			return result;
		};
	const css = cssBinding() as EvalInput["css"];
	css.class = cssBinding("class") as EvalInput["css"]["class"];
	css.raw = cssBinding("raw") as EvalInput["css"]["raw"];
	const cx = (...callInputs: Array<never>) => {
		recordArgs(callInputs);
		const result = input.cx(...callInputs);
		inputs.push(...splitClasses(result));
		return result;
	};

	const fn = new Function("tw", "css", "cx", "props", `"use strict";\n${prepared.body}`);
	const raw = fn(tw, css, cx, input.props ?? {});
	if (typeof raw !== "string") {
		return { ok: false, error: "the final expression did not produce a class string" };
	}

	const survived = splitClasses(raw);
	const uniqueIn = dedupe(inputs);
	const killed = dedupe(uniqueIn.filter((token) => !survived.includes(token)));
	const foldInfo = classifyFold(exprText, prepared.consts);

	return {
		ok: true,
		output: raw,
		tokensIn: uniqueIn,
		survived: dedupe(survived),
		killed,
		fold: foldInfo.fold,
		foldNote: foldInfo.note,
		atomDeclarations,
	};
}
