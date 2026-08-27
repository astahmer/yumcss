/**
 * Compile-time `cx()` inlining — the sibling pass to `inlineTwCalls`.
 *
 * A `cx(...)` call whose arguments are all statically evaluable is folded
 * into its final class string at build time by calling a REAL
 * `createCx(config)` instance with the evaluated inputs, so build output is
 * byte-identical to what the runtime would return for the same call. Apps
 * whose calls are all-literal can then tree-shake the cx runtime away.
 *
 * Supported arguments (conservative on purpose):
 *
 * - string literals and template literals (expressions must themselves be
 *   statically evaluable — see constant propagation below);
 * - `false`, `null`, `undefined`;
 * - nested array literals of the above;
 * - `&&` / `||` / `??` chains and ternaries whose operands are themselves
 *   statically evaluable (`cond && "px-4"` with a literal/known `cond`);
 * - module-level `const` bindings via CONSTANT PROPAGATION: `const P6 =
 *   "p-6"` (string literals, expression-less templates, `+` concatenation
 *   chains of known values) declared at the module's top level. A name is
 *   propagated only when it is provably un-shadowed and never written:
 *   ANY other binding of the same name anywhere in the module (nested
 *   declarator, parameter, import, function/class, catch) or any write
 *   excludes it entirely;
 * - when the tw pass runs first (it does), already-folded `tw({ ... })`
 *   string literals participate like any other string;
 * - PARTIAL FOLDING: a call with exactly ONE dynamic argument that is a
 *   conditional whose BRANCHES are static (`flag ? "a" : "b"`,
 *   `flag && "a"`) and whose remaining arguments are fully static is
 *   rewritten to the conditional over two pre-merged strings — eliminating
 *   the runtime cx call while keeping semantics identical.
 *
 * Anything referencing unknown identifiers, spreads, or cross-module
 * bindings leaves the whole call untouched for the runtime — except
 * module-level constants, which propagate (see `consts`).
 *
 * When a fold context is supplied (`options.css` on the plugin), literal
 * `css(...)` / `css.class(...)` calls compile to their final atom classes at
 * build time too — see engine-context.ts. The compiled atoms join the merge
 * through the context's registry, so they conflict/merge against tw tokens
 * exactly like runtime css atoms. Bare `css(...)` maps fold to the same
 * space-joined string the runtime would push entry-by-entry; `css.raw(...)`
 * stays dynamic (it yields a style map, not classes).
 */
import { type Expression } from "oxc-parser";
import { parseSourceProgram } from "../source-scanner.ts";
import { bindingIsShadowedOrWritten } from "./ast-walk.ts";
import { type CxInput } from "../cx/index.ts";
import { evalLiteral, type OxcNode } from "../tw/literal.ts";
import type { TwConfig } from "./inline.ts";
import type { PandwindEngineContext } from "./engine-context.ts";
import { createCxEvaluationPort } from "./cx-evaluator.ts";
import { createLineIndex, collectUnresolvedTokens, type UnresolvedToken } from "./unresolved.ts";
import type { OnUnresolved } from "./inline.ts";

interface CallNode extends OxcNode {
	start: number;
	end: number;
	callee: OxcNode | null;
	arguments: unknown[];
}

/** Sentinel distinguishing "not statically evaluable" from a literal `undefined`. */
const NOT_STATIC = Symbol("pandwind.cx-not-static");

/**
 * Module-level constant scope: name -> statically evaluated value. Only
 * names proven un-shadowed and never written reach this map.
 */
export interface KnownConstant {
	value: StaticEval;
	/** Character offset of the declaration — uses before this stay dynamic. */
	declStart: number;
}

/** Module-level constant scope for proven-unshadowed top-level consts. */
export type ConstantScope = Map<string, KnownConstant>;

/**
 * `true` literals participate in logical/conditional folding even though
 * they are not part of `CxInput`: the runtime's pushInput ignores booleans,
 * so passing them through preserves equivalence.
 */
type StaticEval = CxInput | true | typeof NOT_STATIC;

/** JS truthiness restricted to the value space cx accepts. */
function isTruthy(value: StaticEval): boolean {
	if (value === false || value === null || value === undefined || value === "") return false;
	return true;
}

/* ------------------------------------------------------------------ *
 * Constant propagation
 * ------------------------------------------------------------------ */

interface ConstCandidate {
	init: Expression;
	/** Resolved value once evaluation succeeded; undefined until then. */
	value?: StaticEval;
}

/**
 * Collect candidate top-level `const` bindings, then resolve them in
 * declaration order so chains (`const B = A + " py-4"`) can reference
 * earlier candidates. Forward references and cycles resolve to nothing.
 */
function resolveTopLevelConsts(program: OxcNode): Map<string, ConstCandidate & { decl: OxcNode }> {
	const candidates = new Map<string, ConstCandidate & { decl: OxcNode }>();
	for (const statement of (program as { body?: OxcNode[] }).body ?? []) {
		if ((statement as { type?: string }).type !== "VariableDeclaration") continue;
		if ((statement as { kind?: string }).kind !== "const") continue;
		for (const declarator of (statement as { declarations?: OxcNode[] }).declarations ?? []) {
			const id = (declarator as { id?: OxcNode }).id;
			const init = (declarator as { init?: Expression | null }).init;
			if (!id || !init) continue;
			if ((id as { type?: string }).type !== "Identifier") continue;
			const name = (id as { name?: string }).name ?? "";
			if (name === "" || candidates.has(name)) continue;
			candidates.set(name, { init, decl: declarator });
		}
	}
	return candidates;
}

function isBindingIdentifierMatch(node: OxcNode | null | undefined, name: string): boolean {
	if (!node) return false;
	if ((node as { type?: string }).type !== "Identifier") return false;
	return (node as { name?: string }).name === name;
}

/**
 * True when the module rebinds or writes to `name` anywhere: nested
 * declarators, parameters, imports, functions/classes, catch params, or
 * plain assignment/update targets. Reads do NOT count — they are the point.
 */
function nameIsRisky(
	program: OxcNode,
	name: string,
	exceptDeclarators: ReadonlySet<OxcNode>,
): boolean {
	for (const node of iterAll(program)) {
		switch ((node as { type?: string }).type) {
			case "VariableDeclarator": {
				if (exceptDeclarators.has(node as unknown as OxcNode)) break;
				if (isBindingIdentifierMatch((node as { id?: OxcNode }).id, name)) return true;
				break;
			}
			case "FunctionDeclaration":
			case "ClassDeclaration": {
				if (isBindingIdentifierMatch((node as { id?: OxcNode | null }).id, name)) return true;
				break;
			}
			case "ImportSpecifier": {
				if (isBindingIdentifierMatch((node as { local?: OxcNode }).local, name)) return true;
				break;
			}
			case "CatchClause": {
				if (isBindingIdentifierMatch((node as { param?: OxcNode | null }).param, name)) {
					return true;
				}
				break;
			}
			case "AssignmentExpression": {
				// The root identifier of the assignment target chain.
				let target: OxcNode | undefined = (node as { left?: OxcNode }).left;
				while (target && (target as { type?: string }).type === "MemberExpression") {
					target = (target as { object?: OxcNode }).object;
				}
				if (isBindingIdentifierMatch(target, name)) return true;
				break;
			}
			case "UpdateExpression": {
				if (isBindingIdentifierMatch((node as { argument?: OxcNode }).argument, name)) {
					return true;
				}
				break;
			}
			default:
				break;
		}
		// Parameters of every function-like node bind in a nested scope —
		// a same-named parameter shadows the constant for that scope.
		if (
			(node as { type?: string }).type === "FunctionDeclaration" ||
			(node as { type?: string }).type === "FunctionExpression" ||
			(node as { type?: string }).type === "ArrowFunctionExpression"
		) {
			for (const param of (node as { params?: OxcNode[] }).params ?? []) {
				for (const inner of iterAll(param)) {
					if (isBindingIdentifierMatch(inner, name)) return true;
					// Only the outermost identifier of a default-value pattern
					// binds; walking everything is conservative but safe.
				}
			}
		}
	}
	return false;
}

/**
 * Build the constant scope for a parsed module. Exported for tests. Returns
 * an empty map for sources without usable top-level constants. Names that
 * are rebound/shadowed/written anywhere in the module never propagate.
 */
export function collectModuleConstants(program: OxcNode): ConstantScope {
	const candidates = resolveTopLevelConsts(program);
	if (candidates.size === 0) return new Map();

	const scope: ConstantScope = new Map();
	for (const [name, candidate] of candidates) {
		// Declaration order: earlier constants are already resolved, so
		// concatenation chains work; later/forward references don't.
		const probe: ConstantScope = new Map(scope);
		candidate.value = evalStaticCx(candidate.init, undefined, probe);
		if (candidate.value === NOT_STATIC) continue;
		const own = new Set<OxcNode>([candidate.decl]);
		if (!nameIsRisky(program, name, own)) {
			scope.set(name, {
				value: candidate.value,
				declStart:
					(candidate.decl as unknown as { start?: number }).start ?? Number.POSITIVE_INFINITY,
			});
		}
	}
	return scope;
}

/* ------------------------------------------------------------------ *
 * Static evaluation (constant-aware)
 * ------------------------------------------------------------------ */

/**
 * Fold support for literal `css()` atoms inside evaluated expressions.
 * Provided by the plugin when css-folding is configured.
 */
export interface CxFoldContext {
	/** Local bindings imported as `css` from matching sources. */
	cssNames: ReadonlySet<string>;
	/** The shared engine context doing the actual compilation. */
	engine: PandwindEngineContext;
}

/**
 * Statically evaluate one expression. Returns NOT_STATIC when any part of it
 * references something we cannot know at build time. With a fold context,
 * literal `css()` / `css.class()` calls compile to their atom class string.
 * `consts` enables module-level constant propagation for Identifier
 * references, template interpolations and `+` concatenation chains built
 * from known values.
 */
export function evalStaticCx(
	node: Expression | undefined,
	fold?: CxFoldContext,
	consts?: ConstantScope,
): StaticEval {
	if (!node) return NOT_STATIC;
	switch (node.type) {
		case "Literal": {
			const value = (node as { value?: unknown }).value;
			if (typeof value === "string") return value;
			if (value === false || value === null || value === true) {
				return value as CxInput;
			}
			return NOT_STATIC;
		}
		case "Identifier": {
			// Only the bare global `undefined` is static here.
			const name = (node as { name?: string }).name;
			if (name === "undefined") return undefined as CxInput;
			if (consts !== undefined && typeof node.start === "number") {
				const known = consts.get(name ?? "");
				// Position guard: a use BEFORE the declaration must stay
				// dynamic — the runtime would throw a TDZ ReferenceError
				// there, and silently succeeding would change semantics.
				if (known !== undefined && node.start >= known.declStart) {
					return known.value;
				}
			}
			return NOT_STATIC;
		}
		case "TemplateLiteral": {
			const expressions = (node as { expressions?: Expression[] }).expressions ?? [];
			const quasis = (node as { quasis?: Array<{ value: { cooked?: string; raw: string } }> })
				.quasis;
			if (!quasis) return NOT_STATIC;
			let out = quasis[0]?.value.cooked ?? quasis[0]?.value.raw ?? "";
			for (let i = 0; i < expressions.length; i++) {
				const value = evalStaticCx(expressions[i], fold, consts);
				if (value === NOT_STATIC || typeof value !== "string") return NOT_STATIC;
				out += value;
				out += quasis[i + 1]?.value.cooked ?? quasis[i + 1]?.value.raw ?? "";
			}
			return out;
		}
		case "BinaryExpression": {
			if ((node as { operator?: string }).operator !== "+") return NOT_STATIC;
			const left = evalStaticCx((node as { left: Expression }).left, fold, consts);
			if (typeof left !== "string") return NOT_STATIC;
			const right = evalStaticCx((node as { right: Expression }).right, fold, consts);
			if (typeof right !== "string") return NOT_STATIC;
			return left + right;
		}
		case "ArrayExpression": {
			// Elements may include literal `true` (ignored by the runtime merge,
			// same behavior when the array arrives at runtime cx) — hence the
			// cast; the shape is what the runtime consumes either way.
			const values: StaticEval[] = [];
			for (const element of (node as { elements?: unknown[] }).elements ?? []) {
				if (element === null || (element as { type?: string }).type === "SpreadElement") {
					return NOT_STATIC;
				}
				const value = evalStaticCx(element as Expression, fold, consts);
				if (value === NOT_STATIC) return NOT_STATIC;
				values.push(value);
			}
			return values as unknown as CxInput;
		}
		case "LogicalExpression": {
			const { operator } = node as { operator: string };
			const left = evalStaticCx((node as { left: Expression }).left, fold, consts);
			if (left === NOT_STATIC) return NOT_STATIC;
			const right = () => evalStaticCx((node as { right: Expression }).right, fold, consts);
			switch (operator) {
				case "&&":
					return isTruthy(left) ? right() : left;
				case "||":
					return isTruthy(left) ? left : right();
				case "??":
					return left !== null && left !== undefined ? left : right();
				default:
					return NOT_STATIC;
			}
		}
		case "ConditionalExpression": {
			const test = evalStaticCx((node as { test: Expression }).test, fold, consts);
			if (test === NOT_STATIC) return NOT_STATIC;
			return isTruthy(test)
				? evalStaticCx((node as { consequent: Expression }).consequent, fold, consts)
				: evalStaticCx((node as { alternate: Expression }).alternate, fold, consts);
		}
		case "CallExpression": {
			if (fold === undefined) return NOT_STATIC;
			const call = node as unknown as CallNode;
			const callee = call.callee;
			// Bare css(...) and css.class(...) fold; css.raw(...) yields a
			// style map, not classes — stays dynamic.
			let isFoldable = false;
			if (
				callee?.type === "Identifier" &&
				fold.cssNames.has((callee as { name?: string }).name ?? "")
			) {
				isFoldable = true;
			} else if (callee?.type === "MemberExpression") {
				const object = (callee as { object?: OxcNode | null }).object;
				const property = (callee as { property?: { name?: string } | null }).property?.name;
				isFoldable =
					object?.type === "Identifier" &&
					fold.cssNames.has((object as { name?: string }).name ?? "") &&
					property === "class";
			}
			if (!isFoldable) return NOT_STATIC;
			if ((call.arguments as unknown[]).length === 0) return NOT_STATIC;

			const classes: string[] = [];
			for (const argument of call.arguments as Expression[]) {
				const literal = evalLiteral(argument, consts);
				if (literal === null || typeof literal !== "object" || Array.isArray(literal)) {
					return NOT_STATIC;
				}
				if (literal === null || typeof literal !== "object" || Array.isArray(literal)) {
					return NOT_STATIC;
				}
				const compiled = fold.engine.foldLiteralStyle(literal as Record<string, unknown>);
				if (compiled === null) return NOT_STATIC;
				classes.push(compiled);
			}
			return classes.join(" ");
		}
		default:
			return NOT_STATIC;
	}
}

export interface CxImportInfo {
	localNames: Set<string>;
	sources: string[];
}

/** Collect local bindings imported as `cx` from cx modules in `code`. */
export function findCxImports(
	code: string,
	id: string,
	isCxSource: (source: string) => boolean,
): CxImportInfo {
	const result = parseSourceProgram({ file: id, source: code });
	const info: CxImportInfo = { localNames: new Set(), sources: [] };

	// Queue (not stack) so import declarations are visited in source order.
	const queue: unknown[] = [result.program];
	for (let head = 0; head < queue.length; head++) {
		const current = queue[head];
		if (Array.isArray(current)) {
			queue.push(...current);
		} else if (current !== null && typeof current === "object") {
			const node = current as OxcNode;
			if (node.type === "ImportDeclaration") {
				const source = (node as { source?: { value?: string } }).source?.value;
				if (typeof source === "string" && isCxSource(source)) {
					info.sources.push(source);
					for (const specifier of (node as { specifiers?: Array<Record<string, unknown>> })
						.specifiers ?? []) {
						if (specifier.type !== "ImportSpecifier") continue;
						const imported = (specifier.imported as { name?: string } | undefined)?.name;
						const local = (specifier.local as { name?: string } | undefined)?.name;
						if (imported === "cx" && typeof local === "string") {
							info.localNames.add(local);
						}
					}
				}
			}
			queue.push(...Object.values(node));
		}
	}
	return info;
}

/** Iterative depth-first walk over an oxc AST in document order. */
function walkNodes(root: unknown, visit: (node: OxcNode) => void): void {
	const queue: unknown[] = [root];
	for (let head = 0; head < queue.length; head++) {
		const current = queue[head];
		if (Array.isArray(current)) {
			queue.push(...current);
		} else if (current !== null && typeof current === "object") {
			const node = current as OxcNode;
			if (typeof node.type === "string") visit(node);
			queue.push(...Object.values(node));
		}
	}
}

/** Iterative walk yielding every AST node (including the root). */
function* iterAll(root: unknown): Generator<OxcNode> {
	const queue: unknown[] = [root];
	for (let head = 0; head < queue.length; head++) {
		const current = queue[head];
		if (Array.isArray(current)) {
			queue.push(...current);
		} else if (current !== null && typeof current === "object") {
			const node = current as OxcNode;
			if (typeof node.type === "string") yield node;
			queue.push(...Object.values(node));
		}
	}
}

export interface InlineResult {
	code: string;
	inlined: number;
	/** Folded class tokens outside the design system (onUnresolved lane). */
	unresolved?: UnresolvedToken[];
}

/* ------------------------------------------------------------------ *
 * Partial folding — recursive conditional skeletons
 * ------------------------------------------------------------------ */

/**
 * A statically-resolvable decision tree extracted from one dynamic cx()
 * argument. Leaves are the only runtime-varying values; an `and` guard
 * contributes its right side when the test is truthy and behaves like
 * `false` otherwise.
 */
type FoldSkeleton =
	| { kind: "leaf"; value: StaticEval }
	| { kind: "cond"; testSource: string; consequent: FoldSkeleton; alternate: FoldSkeleton }
	| { kind: "and"; testSource: string; right: FoldSkeleton };

/**
 * Extract a decision skeleton from a dynamic argument. Tests may be
 * arbitrarily dynamic (their SOURCE TEXT is preserved into the emitted
 * expression); everything down each branch must resolve statically,
 * recursively through nested ternaries and `&&` guards. Returns null when
 * any leaf stays unknowable or for logical operators other than `&&`
 * (`||` / `??` have fallback semantics that would change under pre-merging).
 */
function buildSkeleton(node: Expression, consts: ConstantScope, code: string): FoldSkeleton | null {
	const value = evalStaticCx(node, undefined, consts);
	if (value !== NOT_STATIC) return { kind: "leaf", value };
	switch ((node as { type?: string }).type) {
		case "ConditionalExpression": {
			const consequent = buildSkeleton(
				(node as { consequent: Expression }).consequent,
				consts,
				code,
			);
			if (consequent === null) return null;
			const alternate = buildSkeleton((node as { alternate: Expression }).alternate, consts, code);
			if (alternate === null) return null;
			const { start, end } = node as unknown as { start: number; end: number };
			return { kind: "cond", testSource: code.slice(start, end), consequent, alternate };
		}
		case "LogicalExpression": {
			if ((node as { operator?: string }).operator !== "&&") return null;
			const right = buildSkeleton((node as { right: Expression }).right, consts, code);
			if (right === null) return null;
			const { start, end } = node as unknown as { start: number; end: number };
			return { kind: "and", testSource: code.slice(start, end), right };
		}
		default:
			return null;
	}
}

/**
 * Render the emitted expression for a skeleton: every execution path is
 * pre-merged at build time with the static siblings, so the emitted code is
 * a pure decision over already-final class strings.
 */
function renderPartialFold(
	skeleton: FoldSkeleton,
	dynamicIndex: number,
	staticInputs: Array<StaticEval>,
	merge: (inputs: CxInput[]) => string | undefined,
): string | null {
	const render = (skel: FoldSkeleton): string | null => {
		switch (skel.kind) {
			case "leaf": {
				const inputs = staticInputs.map((value, i) =>
					i === dynamicIndex ? skel.value : value,
				) as CxInput[];
				const merged = merge(inputs);
				if (merged === undefined) return null;
				return JSON.stringify(merged);
			}
			case "cond": {
				// The test source may itself be a conditional/logical
				// expression, so parenthesize it — a bare nested ternary would
				// otherwise bind into OUR ternary's branches.
				const consequent = render(skel.consequent);
				if (consequent === null) return null;
				const alternate = render(skel.alternate);
				if (alternate === null) return null;
				return `((${skel.testSource}) ? ${consequent} : ${alternate})`;
			}
			case "and": {
				const truthy = render(skel.right);
				if (truthy === null) return null;
				const falsyInputs = staticInputs.map((value, i) =>
					i === dynamicIndex ? false : value,
				) as CxInput[];
				const falsy = merge(falsyInputs);
				if (falsy === undefined) return null;
				return `((${skel.testSource}) ? ${truthy} : ${JSON.stringify(falsy)})`;
			}
		}
	};
	return render(skeleton);
}

export interface InlineCxCallsOptions {
	/**
	 * Pre-resolved cross-module constants (see cross-module-consts.ts):
	 * imported bindings that resolve to exported string constants. Merged
	 * UNDER the module's own scope — same-module declarations always win.
	 */
	importedConstants?: ConstantScope;
	/**
	 * Fold context enabling compile-time compilation of literal `css()` /
	 * `css.class()` calls to atom classes (see engine-context.ts). Supplied
	 * by `pandwindVite` when the css plugin config is present.
	 */
	fold?: CxFoldContext;
	/**
	 * Enable module-level constant propagation (default true). Disabled only
	 * by the fold-coverage harness to measure the before/after delta.
	 */
	constants?: boolean;
	/**
	 * Enable partial folding of conditionals with static branches (default
	 * true). Disabled only by the fold-coverage harness.
	 */
	partialFold?: boolean;
	/** Collect folded tokens outside the design system (onUnresolved lane). */
	onUnresolved?: OnUnresolved;
}

/**
 * Replace statically-evaluable `cx(...)` calls with their exact runtime
 * output. The merge runs through a real `createCx(config)` built from the
 * same generated metadata the app's runtime cx uses, so equivalence holds by
 * construction (and is proven differentially by tests/vite-cx-inline.test.ts).
 *
 * With a fold context, literal `css()` atoms inside cx() compile at build
 * time through the shared engine context; their classes join the merge via
 * the context's atom registry — createCx only ever reads `[ATOM_REGISTRY]`
 * off its css instance, so the context's registry participates directly.
 */
/**
 * Imported constants sit under the module's own scope — locals win. Names
 * that are shadowed or written anywhere in THIS module are dropped: their
 * runtime value may differ from the exported constant.
 */
function mergeImported(
	program: OxcNode,
	local: ConstantScope,
	imported?: ConstantScope,
): ConstantScope {
	if (imported === undefined || imported.size === 0) return local;
	const merged: ConstantScope = new Map();
	for (const [name, known] of imported) {
		if (!bindingIsShadowedOrWritten(program, name)) merged.set(name, known);
	}
	for (const [name, known] of local) merged.set(name, known);
	return merged;
}

export function inlineCxCalls(
	code: string,
	id: string,
	config: TwConfig,
	cxNames: ReadonlySet<string>,
	options: InlineCxCallsOptions = {},
): InlineResult {
	const fold = options.fold;
	if (cxNames.size === 0 && fold === undefined) return { code, inlined: 0 };
	const enableConstants = options.constants !== false;
	const enablePartialFold = options.partialFold !== false;

	const result = parseSourceProgram({ file: id, source: code });
	const consts = enableConstants
		? mergeImported(
				result.program as unknown as OxcNode,
				collectModuleConstants(result.program as unknown as OxcNode),
				options.importedConstants,
			)
		: new Map();
	const evaluate = createCxEvaluationPort(
		{ conflicts: config.conflicts, compose: config.compose },
		fold === undefined ? {} : { engine: fold.engine },
	);
	const edits: Array<{ start: number; end: number; text: string }> = [];
	let inlined = 0;
	const checkUnresolved = options.onUnresolved !== undefined && options.onUnresolved !== "off";
	const lines = checkUnresolved ? createLineIndex(code) : undefined;
	const unresolved: UnresolvedToken[] = [];

	const mergeInputs = (inputs: CxInput[]): string | undefined => {
		// `true` entries are ignored by the runtime merge, so passing the
		// evaluated list through as CxInput preserves equivalence.
		return evaluate.merge(inputs);
	};

	walkNodes(result.program, (node) => {
		if (node.type !== "CallExpression") return;
		const call = node as CallNode;
		const calleeName = (call.callee as { name?: string } | null)?.name;
		if (call.callee?.type !== "Identifier" || !cxNames.has(calleeName ?? "")) return;

		const args = call.arguments as Expression[];
		const inputs: StaticEval[] = [];
		let dynamicConditional: { index: number; node: Expression } | undefined;
		for (let i = 0; i < args.length; i++) {
			const value = evalStaticCx(args[i], fold, consts);
			if (value !== NOT_STATIC) {
				inputs.push(value);
				continue;
			}
			// Candidate for partial folding: exactly one dynamic argument,
			// and it must be a conditional whose BRANCHES are static (the
			// test may be fully dynamic).
			const argNode = args[i] as { type?: string } | undefined;
			const argType = argNode?.type;
			if (
				enablePartialFold &&
				dynamicConditional === undefined &&
				(argType === "ConditionalExpression" || argType === "LogicalExpression")
			) {
				if (argNode) dynamicConditional = { index: i, node: argNode as Expression };
				inputs.push(NOT_STATIC);
				continue;
			}
			return; // genuinely dynamic call — leave it alone
		}

		if (dynamicConditional === undefined) {
			const merged = mergeInputs(inputs as CxInput[]);
			if (merged === undefined) return;
			edits.push({
				start: call.start,
				end: call.end,
				text: JSON.stringify(merged),
			});
			inlined++;
			if (lines !== undefined) {
				unresolved.push(...collectUnresolvedTokens(merged, lines.lineOf(call.start), config));
			}
			return;
		}

		// Partial fold: pre-merge every execution path of the conditional
		// with the static siblings. Each emitted path's string equals exactly
		// what the runtime cx would return for that path's inputs —
		// equivalence holds by construction.
		const { index, node: condNode } = dynamicConditional;
		const skeleton = buildSkeleton(condNode, consts, code);
		if (skeleton === null) return;
		const rendered = renderPartialFold(skeleton, index, inputs, mergeInputs);
		if (rendered === null) return;
		edits.push({
			start: call.start,
			end: call.end,
			text: rendered,
		});
		inlined++;
	});

	if (edits.length === 0) return { code, inlined: 0 };
	let output = code;
	for (const edit of [...edits].toSorted((a, b) => b.start - a.start)) {
		output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
	}
	return { code: output, inlined, unresolved };
}
