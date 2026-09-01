/**
 * Pure helpers for the pandwind vite plugin — shared, unit-testable, and free
 * of vite/rollup types.
 *
 * The plugin statically inlines `tw({ ... })` calls whose argument is a pure
 * object literal: the object is compiled through the *same* `compileStyles`
 * the runtime uses, and the call is replaced by a plain string literal. The
 * transform runs before Tailwind's file scanner, so inlined classes are found
 * naturally and the runtime cost becomes zero. Calls with dynamic arguments
 * are left untouched and keep working through the normal runtime.
 */
import { type Expression } from "oxc-parser";
import { SOURCE_SCANNER_SERVICE } from "../source-scanner.ts";
import {
	compileStyles,
	type TwComposeMeta,
	type TwConflictsMeta,
	type TwNestedStyles,
	type TwVariantsMeta,
} from "../tw/compile.ts";
import { evalLiteral, type LiteralConstantScope, type OxcNode, walk } from "../tw/literal.ts";
import { collectModuleConstants, type ConstantScope } from "./cx-inline.ts";
import { createLineIndex, collectUnresolvedTokens, type UnresolvedToken } from "./unresolved.ts";

export interface TwConfig {
	variants: TwVariantsMeta;
	conflicts?: TwConflictsMeta;
	compose?: TwComposeMeta;
}

interface CallNode extends OxcNode {
	start: number;
	end: number;
	callee: OxcNode | null;
	arguments: unknown[];
}

/**
 * Extract the `createTw({ variants, conflicts, compose })` config from a
 * generated `tw.ts` source. The generated shape is stable, so a plain oxc
 * parse + literal evaluation is enough — no type info needed.
 */
export function extractTwConfig(source: string): TwConfig | undefined {
	const result = SOURCE_SCANNER_SERVICE.parse({ file: "tw.ts", source });
	let config: TwConfig | undefined;

	// The generator may pass the config as a module-level const identifier
	// (`const __pandwindConfig = {...}; createTw(__pandwindConfig)`) so apps
	// can reuse it for runtime cx(). Resolve such identifiers to their
	// initializer before evaluating.
	const topLevelConsts = new Map<string, Expression>();
	walk(result.program, (node) => {
		if (node.type !== "VariableDeclaration" || node.kind !== "const") return;
		for (const declarator of (
			node as unknown as {
				declarations: Array<{
					id: { type: string; name?: string };
					init: Expression | null | undefined;
				}>;
			}
		).declarations) {
			if (declarator.id.type === "Identifier" && declarator.id.name && declarator.init) {
				topLevelConsts.set(declarator.id.name, declarator.init);
			}
		}
	});
	const resolveArg = (argument: Expression): Expression => {
		if (argument.type !== "Identifier") return argument;
		const name = (argument as unknown as { name?: string }).name;
		if (name === undefined || name.startsWith("$")) return argument;
		return (topLevelConsts.get(name) ?? argument) as Expression;
	};
	walk(result.program, (node) => {
		if (config !== undefined || node.type !== "CallExpression") return;
		const callee = node.callee as OxcNode | null;
		if (callee?.type !== "Identifier" || callee.name !== "createTw") return;
		const argument = (node.arguments as Expression[])[0];
		if (argument === undefined || argument === null) return;
		const literal = evalLiteral(resolveArg(argument));
		if (typeof literal !== "object" || literal === null) return;
		const options = literal as Record<string, unknown>;
		const variants = options.variants;
		if (typeof variants !== "object" || variants === null) return;
		config = {
			variants: variants as TwVariantsMeta,
			conflicts:
				typeof options.conflicts === "object" && options.conflicts !== null
					? (options.conflicts as TwConflictsMeta)
					: undefined,
			compose: Array.isArray(options.compose) ? (options.compose as string[]) : undefined,
		};
	});

	return config;
}

export interface InlineResult {
	code: string;
	inlined: number;
	/** Folded class tokens outside the design system (onUnresolved lane). */
	unresolved?: UnresolvedToken[];
}

/**
 * Fail-fast policy for folded class tokens outside the design system —
 * arbitrary `[...]` values and tokens Tailwind will not compile. Collection
 * only runs when the mode is set; the plugin core owns reporting.
 */
export type OnUnresolved = "warn" | "error" | "off";

/** Runtime-safe identity values; this module is also loaded by Node's Vite config loader. */
export const OnUnresolvedTag = {
	Warn: "warn",
	Error: "error",
	Off: "off",
} as const;

export interface UnresolvedOptions {
	/** Collect unresolved tokens for the plugin's onUnresolved lane. */
	onUnresolved?: OnUnresolved;
}

/**
 * Replace `tw({ ... })` calls with literal arguments by their compiled class
 * string. `twNames` are the local bindings imported from the generated tw
 * module (including aliases). Module-level constants (see
 * `collectModuleConstants`) participate: property values referencing proven
 * constants fold like literals. Returns the transformed code and the number
 * of calls inlined; unrepresentable calls are left for the runtime.
 */
export function inlineTwCalls(
	code: string,
	id: string,
	config: TwConfig,
	twNames: ReadonlySet<string>,
	importedConstants?: ConstantScope,
	options?: UnresolvedOptions,
): InlineResult {
	const result = SOURCE_SCANNER_SERVICE.parse({ file: id, source: code });
	// evalLiteral consumes RAW constant values, not the {value, declStart}
	// records the cx evaluator uses for its TDZ position guard.
	const importedScope: ConstantScope = importedConstants ?? new Map();
	const consts: LiteralConstantScope = new Map([
		// Cross-module imported constants sit under same-module declarations.
		...[...importedScope].map(([name, known]) => [name, known.value] as const),
		...[...collectModuleConstants(result.program as unknown as OxcNode)].map(
			([name, known]) => [name, known.value] as const,
		),
	]);
	const edits: Array<{ start: number; end: number; text: string }> = [];
	let inlined = 0;
	const checkUnresolved =
		options?.onUnresolved !== undefined && options.onUnresolved !== OnUnresolvedTag.Off;
	const lines = checkUnresolved ? createLineIndex(code) : undefined;
	const unresolved: UnresolvedToken[] = [];

	walk(result.program, (node) => {
		if (node.type !== "CallExpression") return;
		const call = node as CallNode;
		const callee = call.callee;
		const calleeName = (callee as { name?: string } | null)?.name;
		if (callee?.type !== "Identifier" || !twNames.has(calleeName ?? "")) {
			return;
		}
		if (call.arguments.length !== 1) return;
		const styles = evalLiteral(call.arguments[0] as Expression, consts);
		if (typeof styles !== "object" || styles === null || Array.isArray(styles)) {
			return;
		}
		try {
			const compiled = compileStyles(
				styles as TwNestedStyles,
				config.variants,
				config.conflicts,
				config.compose,
			);
			edits.push({
				start: call.start,
				end: call.end,
				text: JSON.stringify(compiled),
			});
			inlined++;
			if (lines !== undefined) {
				unresolved.push(...collectUnresolvedTokens(compiled, lines.lineOf(call.start), config));
			}
		} catch {
			// Invalid style object (e.g. modifier variant without a nested
			// variant) — leave the call so the runtime surfaces the error.
		}
	});

	if (edits.length === 0) return { code, inlined: 0 };
	let output = code;
	for (const edit of [...edits].toSorted((a, b) => b.start - a.start)) {
		output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
	}
	return { code: output, inlined, unresolved };
}
