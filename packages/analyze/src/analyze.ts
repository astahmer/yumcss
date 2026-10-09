/**
 * `yumcss analyze` — fold-coverage reporting.
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
 *   argument static -> full fold; bounded conditionals with static branches
 *   -> partial fold; otherwise runtime;
 * - "full"/"partial" totals are cross-checked against the actual passes'
 *   eliminated counts (see analyze.test.ts).
 */
import { dirname, resolve } from "node:path";
import {
	SOURCE_SCANNER_SERVICE,
	SourceBindingKind,
	SourceBindings,
	type SourceScanResult,
} from "yumcss/source";
import { createSourceWorkspace } from "yumcss/source/workspace";
import { bindingIsShadowedOrWritten } from "yumcss/vite/cross-module-consts";
import {
	collectModuleConstants,
	evalStaticCx,
	type ConstantScope,
	type CxFoldContext,
} from "yumcss/vite/cx-inline";
import { extractTwConfigFromSources, inlineTwCalls, type TwConfig } from "yumcss/vite/inline";
import { compileStyles, type TwNestedStyles } from "yumcss/tw/compile";
import { evalLiteral, walk, type OxcNode } from "yumcss/tw/literal";
import { NodeKind } from "yumcss/tw/literal";
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
	/** Parsed document supplied by the shared workspace scanner when available. */
	sourceScan?: Pick<SourceScanResult, "program">;
	/** Same preset-backed CSS fold context used by the Vite cx() pass. */
	cxFold?: CxFoldContext;
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
	const probe = SOURCE_SCANNER_SERVICE.scan({ file: "probe.ts", source: `unknownRuntimeValue` });
	if (probe.program === undefined) throw new Error("Could not parse the static-evaluation probe.");
	let sentinel: unknown;
	walk(probe.program, (node) => {
		if ((node as { type?: string }).type !== NodeKind.ExpressionStatement) return;
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
	parsedProgram?: OxcNode,
	cxFold?: CxFoldContext,
): ParsedModule {
	const program = parsedProgram ?? SOURCE_SCANNER_SERVICE.scan({ file, source }).program;
	if (program === undefined) throw new Error(`Could not parse ${file} for analysis.`);

	const sourceBindings = SourceBindings.fromProgram(program);
	const imported = new Map<string, string>();
	for (const binding of sourceBindings.bindings) {
		if (
			binding.kind === SourceBindingKind.Named &&
			(binding.importedName === "cx" || binding.importedName === "tw")
		)
			imported.set(binding.localName, binding.importedName);
	}

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
	const localScope = collectModuleConstants(program, cxFold);
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
		if ((node as { type?: string }).type !== NodeKind.CallExpression) return;
		const call = node as {
			callee?: { type?: string; name?: string };
			arguments?: unknown[];
			start?: number;
		};
		if (call.callee?.type !== NodeKind.Identifier) return;
		const name = call.callee.name ?? "";
		const start = call.start ?? 0;
		if (sourceBindings.isShadowedAt(name, start)) return;
		const binding = sourceBindings.binding(name);
		if (binding !== undefined && binding.importedName !== "cx" && binding.importedName !== "tw")
			return;
		if (!cxNames.has(name) && !twNames.has(name)) return;

		if (twNames.has(name)) {
			calls.push({
				start,
				kind: FoldKindTag.Full,
				reason: "",
				args: call.arguments ?? [],
				name,
			});
			return;
		}
		const clsfy = classify(call.arguments ?? [], consts, start, name, twNames, config, cxFold);
		calls.push(clsfy);
	});

	return { program, consts, cxNames, twNames, calls, lineStarts };
}

/**
 * Mirror of buildSkeleton's acceptance rules: can this conditional be
 * partially folded? Ternaries require both branches; `&&` requires only the
 * right side (the left is the kept-dynamic test). Nested conditionals recurse.
 */
const MAX_PARTIAL_FOLD_CASES = 16;

function partialFoldCaseCount(
	node: unknown,
	consts: ConstantScope,
	twNames: ReadonlySet<string>,
	config: TwConfig,
	cxFold?: CxFoldContext,
): number {
	const resolved = resolveTwArg(node, twNames, config, consts);
	const t = (resolved as { type?: string })?.type;
	if (t === "ConditionalExpression") {
		const consequent = branchFoldCaseCount(
			(resolved as { consequent?: unknown }).consequent,
			consts,
			twNames,
			config,
			cxFold,
		);
		const alternate = branchFoldCaseCount(
			(resolved as { alternate?: unknown }).alternate,
			consts,
			twNames,
			config,
			cxFold,
		);
		return consequent === 0 || alternate === 0
			? 0
			: Math.min(MAX_PARTIAL_FOLD_CASES + 1, consequent + alternate);
	}
	if (t === "LogicalExpression" && (resolved as { operator?: string }).operator === "&&") {
		const right = branchFoldCaseCount(
			(resolved as { right?: unknown }).right,
			consts,
			twNames,
			config,
			cxFold,
		);
		return right === 0 ? 0 : Math.min(MAX_PARTIAL_FOLD_CASES + 1, right + 1);
	}
	return 0;
}

function branchFoldCaseCount(
	branch: unknown,
	consts: ConstantScope,
	twNames: ReadonlySet<string>,
	config: TwConfig,
	cxFold?: CxFoldContext,
): number {
	const resolved = resolveTwArg(branch, twNames, config, consts);
	return isStatic(evalStaticCx(resolved as never, cxFold, consts))
		? 1
		: partialFoldCaseCount(resolved, consts, twNames, config, cxFold);
}

/**
 * Resolve `tw({ ... })` calls on the original AST before evaluating cx()
 * arguments. This mirrors Vite's earlier tw pass while preserving source
 * offsets for Inspector diagnostics, including calls nested in conditionals.
 */
function resolveTwArg(
	node: unknown,
	twNames: ReadonlySet<string>,
	config: TwConfig,
	consts: ConstantScope,
): unknown {
	const expression = node as
		| {
				type?: string;
				callee?: OxcNode;
				arguments?: unknown[];
				test?: unknown;
				consequent?: unknown;
				alternate?: unknown;
				left?: unknown;
				right?: unknown;
				expression?: unknown;
		  }
		| undefined;
	if (expression?.type === NodeKind.CallExpression) {
		const callee = expression.callee as { type?: string; name?: string } | undefined;
		if (callee?.type === NodeKind.Identifier && twNames.has(callee.name ?? "")) {
			if ((expression.arguments?.length ?? 0) !== 1) return node;
			const literalScope = new Map([...consts].map(([name, known]) => [name, known.value]));
			const styles = evalLiteral(expression.arguments?.[0] as never, literalScope);
			if (typeof styles !== "object" || styles === null || Array.isArray(styles)) return node;
			try {
				const compiled = compileStyles(
					styles as TwNestedStyles,
					config.variants,
					config.conflicts,
					config.compose,
				);
				return { type: NodeKind.Literal, value: compiled };
			} catch {
				return node;
			}
		}
	}
	if (expression?.type === "ConditionalExpression") {
		return {
			...expression,
			test: resolveTwArg(expression.test, twNames, config, consts),
			consequent: resolveTwArg(expression.consequent, twNames, config, consts),
			alternate: resolveTwArg(expression.alternate, twNames, config, consts),
		};
	}
	if (expression?.type === "LogicalExpression") {
		return {
			...expression,
			left: resolveTwArg(expression.left, twNames, config, consts),
			right: resolveTwArg(expression.right, twNames, config, consts),
		};
	}
	if (
		expression !== undefined &&
		(expression.type === NodeKind.ParenthesizedExpression ||
			expression.type === NodeKind.TSAsExpression ||
			expression.type === NodeKind.TSSatisfiesExpression ||
			expression.type === NodeKind.TSTypeAssertion)
	) {
		return {
			...expression,
			expression: resolveTwArg(expression.expression, twNames, config, consts),
		};
	}
	return node;
}

/** Mirror of inlineCxCalls' per-call decision. */
function classify(
	rawArgs: unknown[],
	consts: ConstantScope,
	start: number,
	name: string,
	twNames: ReadonlySet<string>,
	config: TwConfig,
	cxFold?: CxFoldContext,
): CallInfo & { name: string } {
	const args = rawArgs.map((arg) => resolveTwArg(arg, twNames, config, consts));
	let partialCases = 1;
	let hasPartial = false;
	for (let i = 0; i < args.length; i++) {
		const value = evalStaticCx(args[i] as never, cxFold, consts);
		if (isStatic(value)) continue;
		const type = (args[i] as { type?: string })?.type;
		const conditional = type === "ConditionalExpression" || type === "LogicalExpression";
		if (!conditional) {
			return { start, kind: FoldKindTag.Runtime, reason: explain(args, i), args, name };
		}
		const cases = partialFoldCaseCount(args[i], consts, twNames, config, cxFold);
		if (cases === 0 || partialCases * cases > MAX_PARTIAL_FOLD_CASES) {
			return {
				start,
				kind: FoldKindTag.Runtime,
				reason: cases === 0 ? "conditional with non-static branches" : explain(args, i),
				args,
				name,
			};
		}
		partialCases *= cases;
		hasPartial = true;
	}
	if (hasPartial) {
		return { start, kind: FoldKindTag.Partial, reason: "", args, name };
	}
	return { start, kind: FoldKindTag.Full, reason: "", args, name };
}

function explain(args: unknown[], dynamicIndex: number): string {
	for (const arg of args) {
		if ((arg as { type?: string })?.type === NodeKind.SpreadElement) return "spread argument";
	}
	let conditionals = 0;
	for (const arg of args) {
		const t = (arg as { type?: string })?.type;
		if (t === "ConditionalExpression" || t === "LogicalExpression") conditionals++;
	}
	if (conditionals > 1) return "multiple dynamic conditionals";
	const dynamic = args[dynamicIndex] as { type?: string; expressions?: unknown[] } | undefined;
	if (dynamic?.type === NodeKind.ArrowFunctionExpression) return "function argument";
	if (dynamic?.type === NodeKind.TemplateLiteral && dynamic.expressions?.length) {
		return "runtime template interpolation";
	}
	if (dynamic?.type === NodeKind.MemberExpression) return "member expression value";
	if (dynamic?.type === NodeKind.CallExpression) return "dynamic helper call";
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
	const mod = parseModule(
		source,
		file,
		options.config,
		options.importedConstants,
		options.sourceScan?.program,
		options.cxFold,
	);

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
			const values = call.args.map((arg) => evalStaticCx(arg as never, options.cxFold, mod.consts));
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
	const generatedSources = createSourceWorkspace()
		.read([
			twPath,
			resolve(dirname(twPath), "tw.runtime.ts"),
			resolve(dirname(twPath), "tw.conflicts.ts"),
			resolve(dirname(twPath), "tw.build.ts"),
		])
		.map(({ source }) => source);
	const config =
		generatedSources.length === 0 ? undefined : extractTwConfigFromSources(generatedSources);
	if (config === undefined) {
		throw new Error(`yumcss analyze: could not extract tw config from ${twPath}`);
	}
	return config;
}

/** Collect unique compiler-analyzable script files through the shared source workspace. */
export function collectFiles(patterns: Array<string>, root: string): Array<string> {
	const workspace = createSourceWorkspace();
	const files = workspace
		.files(patterns, root)
		.filter((file) => SOURCE_SCANNER_SERVICE.isScriptFile(file));
	return workspace
		.read(files)
		.filter(({ scan }) => scan.program !== undefined)
		.map(({ path }) => path);
}
