/**
 * `pandwind analyze` — fold-coverage reporting.
 *
 * Runs the same vite folding passes the build uses (tw() inlining followed
 * by cx() inlining with constant propagation and partial conditional
 * folding) over source files, and reports how much class-merging work was
 * eliminated at build time versus left to the runtime.
 *
 * Counting model:
 *
 * - total cx calls are counted on the ORIGINAL module (the passes never add
 *   or remove call sites);
 * - per-call foldability is classified with the engine's own evaluator
 *   (`evalStaticCx`), mirroring `inlineCxCalls`' decision logic: every
 *   argument static -> full fold; exactly one dynamic conditional whose
 *   branches are both static -> partial fold; otherwise runtime;
 * - "full"/"partial" totals are cross-checked against the actual passes'
 *   eliminated counts (see analyze.test.ts).
 */
import { SOURCE_SCANNER_SERVICE } from "pandwind/source";
import { createSourceWorkspace } from "pandwind/source/workspace";
import { bindingIsShadowedOrWritten } from "pandwind/vite/cross-module-consts";
import { collectModuleConstants, evalStaticCx, type ConstantScope } from "pandwind/vite/cx-inline";
import { extractTwConfig, inlineTwCalls, type TwConfig } from "pandwind/vite/inline";
import { compileStyles, type TwNestedStyles } from "pandwind/tw/compile";
import { evalLiteral, walk, type OxcNode } from "pandwind/tw/literal";
import {
	DefaultCssResidualCollector,
	type ArbitraryValueSite,
	type CssResidualCollector,
	type MissingCssSite,
} from "./css-residual-collector.ts";

export { formatReport, summarize } from "./analysis-report.ts";

export interface AnalyzeOptions {
	/** Generated tw module config (conflicts/compose/variants metadata). */
	config: TwConfig;
	/** Local names bound to the generated tw function. Default: ["tw"]. */
	twNames?: ReadonlySet<string>;
	/**
	 * Pre-resolved cross-module constants (`name -> exported string value`),
	 * mirroring inlineCxCalls' `importedConstants` option. Bindings that are
	 * shadowed or written anywhere in the module stay dynamic. Module-local
	 * declarations always win over imported values.
	 */
	importedConstants?: Readonly<Record<string, string>>;
	/**
	 * Class tokens the missing-CSS warnings lane should never flag (custom
	 * or foreign classes deliberately passed through cx()).
	 */
	missingCssIgnore?: ReadonlySet<string>;
}

interface CallSite {
	line: number;
	reason: string;
}

export interface FileFoldStats {
	file: string;
	/** Share of cx calls eliminated at build time (full + partial), %. */
	eliminatedPct: number;
	cxCalls: number;
	cxFoldedFull: number;
	cxFoldedPartial: number;
	cxRuntime: number;
	runtimeSites: Array<CallSite>;
	missingCss: Array<MissingCssSite>;
	arbitraryValues: Array<ArbitraryValueSite>;
	twCalls: number;
	twFolded: number;
}

export interface FoldSummary {
	files: Array<FileFoldStats>;
	totalCxCalls: number;
	fullFolded: number;
	partialFolded: number;
	runtimeCalls: number;
	eliminatedPct: number;
	totalTwCalls: number;
	twFolded: number;
	/** Files where every cx call folded (entry-level counting). */
	filesEliminated: number;
	/** Files containing at least one cx call. */
	filesWithCalls: number;
	/** Entry-level elimination — matches the vite-cx-coverage harness. */
	entryEliminatedPct: number;
	totalMissingCss: number;
	totalArbitraryValues: number;
}

export interface AnalyzeSourceDependencies {
	readonly residuals?: CssResidualCollector;
}

const FoldKindTag = {
	Full: "full",
	Partial: "partial",
	Runtime: "runtime",
} as const;

type FoldKind = (typeof FoldKindTag)[keyof typeof FoldKindTag];

interface CallInfo {
	start: number;
	kind: FoldKind;
	reason: string;
	args: unknown[];
}

/** The evaluator's NOT_STATIC sentinel, derived from a known-dynamic probe. */
const NOT_STATIC: unknown = (() => {
	const probe = SOURCE_SCANNER_SERVICE.parse({ file: "probe.ts", source: `unknownRuntimeValue` });
	let sentinel: unknown;
	walk(probe.program as unknown as OxcNode, (node) => {
		if ((node as { type?: string }).type !== "ExpressionStatement") return;
		sentinel = evalStaticCx((node as { expression?: unknown }).expression as never);
	});
	return sentinel;
})();

function isStatic(value: unknown): boolean {
	return value !== NOT_STATIC;
}

interface ParsedModule {
	program: OxcNode;
	consts: ConstantScope;
	cxNames: Set<string>;
	twNames: Set<string>;
	calls: Array<CallInfo & { name: string }>;
	lineStarts: Array<number>;
}

function parseModule(
	source: string,
	file: string,
	config: TwConfig,
	importedConstants?: Readonly<Record<string, string>>,
): ParsedModule {
	const parsed = SOURCE_SCANNER_SERVICE.parse({ file, source });
	const program = parsed.program as unknown as OxcNode;

	const imported = new Map<string, string>();
	walk(program, (node) => {
		if ((node as { type?: string }).type !== "ImportDeclaration") return;
		for (const specifier of (node as { specifiers?: Array<Record<string, unknown>> }).specifiers ??
			[]) {
			const spec = specifier as {
				type?: string;
				imported?: { name?: string };
				local?: { name?: string };
			};
			if (spec.type !== "ImportSpecifier") continue;
			const importedName = (spec.imported?.name ?? "") as string;
			const local = spec.local?.name ?? "";
			if (importedName === "cx" || importedName === "tw") imported.set(local, importedName);
		}
	});

	// Modules analyzed directly often use the conventional local names
	// without an explicit helper import — mirror the coverage-harness
	// convention and always recognize `cx` / `tw`.
	const cxNames = new Set([
		"cx",
		...[...imported.entries()].filter(([, v]) => v === "cx").map(([k]) => k),
	]);
	const twNames = new Set([
		"tw",
		...[...imported.entries()].filter(([, v]) => v === "tw").map(([k]) => k),
	]);
	const localScope = collectModuleConstants(program);
	// Imported cross-module constants merge UNDER the module's own scope —
	// same-module declarations always win — and bindings that are shadowed
	// or written anywhere stay dynamic (mirrors inlineCxCalls/mergeImported).
	const consts: ConstantScope = new Map();
	if (importedConstants !== undefined) {
		for (const [name, value] of Object.entries(importedConstants)) {
			if (bindingIsShadowedOrWritten(program, name)) continue;
			consts.set(name, { value, declStart: -1 });
		}
	}
	for (const [name, known] of localScope) consts.set(name, known);

	const lineStarts: Array<number> = [0];
	for (let i = 0; i < source.length; i++) {
		if (source[i] === "\n") lineStarts.push(i + 1);
	}

	const calls: Array<CallInfo & { name: string }> = [];
	walk(program, (node) => {
		if ((node as { type?: string }).type !== "CallExpression") return;
		const call = node as {
			callee?: { type?: string; name?: string };
			arguments?: unknown[];
			start?: number;
		};
		if (call.callee?.type !== "Identifier") return;
		const name = call.callee.name ?? "";
		if (!cxNames.has(name) && !twNames.has(name)) return;

		if (twNames.has(name)) {
			calls.push({
				start: call.start ?? 0,
				kind: FoldKindTag.Full,
				reason: "",
				args: call.arguments ?? [],
				name,
			});
			return;
		}
		const clsfy = classify(call.arguments ?? [], consts, call.start ?? 0, name, twNames, config);
		calls.push(clsfy);
	});

	return { program, consts, cxNames, twNames, calls, lineStarts };
}

/**
 * Mirror of buildSkeleton's acceptance rules: can this conditional be
 * partially folded? Ternaries require both branches; `&&` requires only the
 * right side (the left is the kept-dynamic test). Nested conditionals recurse.
 */
function isSkeletonable(node: unknown, consts: ConstantScope): boolean {
	const t = (node as { type?: string })?.type;
	if (t === "ConditionalExpression") {
		return (
			branchFolds((node as { consequent?: unknown }).consequent, consts) &&
			branchFolds((node as { alternate?: unknown }).alternate, consts)
		);
	}
	if (t === "LogicalExpression" && (node as { operator?: string }).operator === "&&") {
		return branchFolds((node as { right?: unknown }).right, consts);
	}
	return false;
}

function branchFolds(branch: unknown, consts: ConstantScope): boolean {
	return (
		isStatic(evalStaticCx(branch as never, undefined, consts)) || isSkeletonable(branch, consts)
	);
}

/**
 * The real vite pipeline inlines `tw({ ... })` calls to plain string
 * literals BEFORE the cx() pass runs (see pandwindVite's transform order),
 * so a `cx(tw({...}), "str")` argument is only a foldable string to the
 * production build. `evalStaticCx` itself never resolves tw() calls (only
 * css() ones) — mirror the inlining decision here, on the untouched AST, so
 * classification matches the build without re-parsing shifted text (which
 * would throw off every reported line number after the fold point).
 */
function resolveTwArg(
	node: unknown,
	twNames: ReadonlySet<string>,
	config: TwConfig,
	consts: ConstantScope,
): unknown {
	const call = node as { type?: string; callee?: OxcNode; arguments?: unknown[] } | undefined;
	if (call?.type !== "CallExpression") return node;
	const callee = call.callee as { type?: string; name?: string } | undefined;
	if (callee?.type !== "Identifier" || !twNames.has(callee.name ?? "")) return node;
	if ((call.arguments?.length ?? 0) !== 1) return node;
	const literalScope = new Map([...consts].map(([n, known]) => [n, known.value]));
	const styles = evalLiteral(call.arguments![0] as never, literalScope);
	if (typeof styles !== "object" || styles === null || Array.isArray(styles)) return node;
	try {
		const compiled = compileStyles(
			styles as TwNestedStyles,
			config.variants,
			config.conflicts,
			config.compose,
		);
		return { type: "Literal", value: compiled };
	} catch {
		return node; // Invalid style object — stays dynamic, same as inlineTwCalls.
	}
}

/** Mirror of inlineCxCalls' per-call decision. */
function classify(
	rawArgs: unknown[],
	consts: ConstantScope,
	start: number,
	name: string,
	twNames: ReadonlySet<string>,
	config: TwConfig,
): CallInfo & { name: string } {
	const args = rawArgs.map((arg) => resolveTwArg(arg, twNames, config, consts));
	let dynamicConditional: { index: number; arg: unknown } | undefined;
	for (let i = 0; i < args.length; i++) {
		const value = evalStaticCx(args[i] as never, undefined, consts);
		if (isStatic(value)) continue;
		const t = (args[i] as { type?: string })?.type;
		if (
			dynamicConditional === undefined &&
			(t === "ConditionalExpression" || t === "LogicalExpression")
		) {
			dynamicConditional = { index: i, arg: args[i] };
			continue;
		}
		return { start, kind: FoldKindTag.Runtime, reason: explain(args), args, name };
	}
	if (dynamicConditional !== undefined) {
		// Partial folding mirrors buildSkeleton exactly: ternaries need
		// both BRANCHES skeletonizable (the test may stay dynamic); an
		// `&&` chain needs only its RIGHT side (the left is the kept-
		// dynamic test). `||` / `??` never partially fold.
		if (!isSkeletonable(dynamicConditional.arg, consts)) {
			return {
				start,
				kind: FoldKindTag.Runtime,
				reason: "conditional with non-static branches",
				args,
				name,
			};
		}
		return { start, kind: FoldKindTag.Partial, reason: "", args, name };
	}
	// All args static: full fold — unless a css()/unknown helper call is
	// among them without a fold context (the pass leaves those alone).
	const hasUnknownCall = args.some((a) => (a as { type?: string })?.type === "CallExpression");
	if (hasUnknownCall) {
		return {
			start,
			kind: FoldKindTag.Runtime,
			reason: "unresolved helper call argument",
			args,
			name,
		};
	}
	return { start, kind: FoldKindTag.Full, reason: "", args, name };
}

function explain(args: unknown[]): string {
	for (const arg of args) {
		if ((arg as { type?: string })?.type === "SpreadElement") return "spread argument";
	}
	let conditionals = 0;
	for (const arg of args) {
		const t = (arg as { type?: string })?.type;
		if (t === "ConditionalExpression" || t === "LogicalExpression") conditionals++;
	}
	if (conditionals > 1) return "multiple dynamic conditionals";
	if (args.some((a) => (a as { type?: string })?.type === "ArrowFunctionExpression"))
		return "function argument";
	if (
		args.some(
			(a) =>
				(a as { type?: string })?.type === "TemplateLiteral" &&
				(a as { expressions?: unknown[] }).expressions?.length,
		)
	) {
		return "runtime template interpolation";
	}
	if (args.some((a) => (a as { type?: string })?.type === "MemberExpression"))
		return "member expression value";
	if (args.some((a) => (a as { type?: string })?.type === "CallExpression"))
		return "dynamic helper call";
	return "unknown runtime value";
}

/**
 * Analyze one module. `file` is only used for reporting (paths as given).
 */
export function analyzeSource(
	source: string,
	file: string,
	options: AnalyzeOptions,
	dependencies: AnalyzeSourceDependencies = {},
): FileFoldStats {
	const mod = parseModule(source, file, options.config, options.importedConstants);

	const runtimeSites: Array<CallSite> = [];
	let cxFoldedFull = 0;
	let cxFoldedPartial = 0;
	let cxRuntime = 0;
	let cxTotal = 0;
	let twCalls = 0;
	let twFolded = 0;

	const working = inlineTwCalls(
		source,
		file,
		options.config,
		options.twNames ?? new Set(["tw"]),
		undefined,
		{ parsedProgram: mod.program },
	);
	twFolded = working.inlined;

	const ignore = options.missingCssIgnore;
	const residuals = dependencies.residuals ?? new DefaultCssResidualCollector();
	const missingCss: Array<MissingCssSite> = [];
	const arbitraryValues: Array<ArbitraryValueSite> = [];
	for (const call of mod.calls) {
		const site = { line: lineOf(mod.lineStarts, call.start), reason: call.reason };
		if (mod.twNames.has(call.name)) {
			twCalls++;
			continue;
		}
		cxTotal++;
		if (call.kind === FoldKindTag.Full) cxFoldedFull++;
		else if (call.kind === FoldKindTag.Partial) cxFoldedPartial++;
		else {
			cxRuntime++;
			runtimeSites.push(site);
		}
		// Warnings lane: statically-known strings from full folds (and the
		// static arguments of partial folds — dynamic conditionals keep their
		// branches out of scope here).
		if (call.kind !== FoldKindTag.Runtime) {
			const values = call.args.map((arg) => evalStaticCx(arg as never, undefined, mod.consts));
			missingCss.push(
				...residuals.missingCss(values, mod.lineStarts, call.start, options.config, ignore),
			);
			arbitraryValues.push(
				...residuals.arbitraryValues(values, mod.lineStarts, call.start, ignore),
			);
		}
	}

	return {
		file,
		eliminatedPct:
			cxTotal === 0 ? 100 : Math.round(((cxFoldedFull + cxFoldedPartial) / cxTotal) * 100),
		cxCalls: cxTotal,
		cxFoldedFull,
		cxFoldedPartial,
		cxRuntime,
		runtimeSites,
		missingCss,
		arbitraryValues,
		twCalls,
		twFolded,
	};
}

function lineOf(lineStarts: Array<number>, offset: number): number {
	let lo = 0;
	let hi = lineStarts.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if ((lineStarts[mid] ?? 0) <= offset) lo = mid;
		else hi = mid - 1;
	}
	return lo + 1;
}

/** Load a generated tw module's config from disk. */
export function loadTwConfig(twPath: string): TwConfig {
	const source = createSourceWorkspace().read([twPath])[0]?.source;
	const config = source === undefined ? undefined : extractTwConfig(source);
	if (config === undefined) {
		throw new Error(`pandwind analyze: could not extract tw config from ${twPath}`);
	}
	return config;
}

/** Collect unique TypeScript files through the shared source workspace. */
export function collectFiles(patterns: Array<string>, root: string): Array<string> {
	return [...createSourceWorkspace().files(patterns, root)].filter((file) =>
		SOURCE_SCANNER_SERVICE.isTypeScriptFile(file),
	);
}
