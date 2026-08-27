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
import { globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SOURCE_SCANNER_SERVICE } from "pandwind/source";
import { bindingIsShadowedOrWritten } from "pandwind/vite/cross-module-consts";
import {
	collectModuleConstants,
	evalStaticCx,
	type ConstantScope,
	type KnownConstant,
} from "pandwind/vite/cx-inline";
import { extractTwConfig, inlineTwCalls, type TwConfig } from "pandwind/vite/inline";
import { compileStyles, type TwNestedStyles } from "pandwind/tw/compile";
import { evalLiteral, walk, type OxcNode } from "pandwind/tw/literal";

interface AnalyzeOptions {
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

/**
 * A statically-known class token that Tailwind will NOT compile — reported
 * as a warning ("runtime class without CSS"). Collected only from
 * fully/partially folded cx() string arguments (tw() literals are typed at
 * the call site and cannot typo; runtime cx() arguments are unknowable).
 * Custom/foreign classes passed through cx() will false-positive here —
 * list them in `AnalyzeOptions.missingCssIgnore`.
 */
interface MissingCssSite {
	line: number;
	token: string;
}

/**
 * A statically-known class token using Tailwind arbitrary-value bracket
 * syntax (`w-[13px]`, `bg-[#0f0]`, `hover:[margin-top:7px]`). These DO
 * compile — they are flagged as a separate off-design-system lane, not as
 * missing CSS. Same collection scope and `missingCssIgnore` opt-out as the
 * missing-CSS lane.
 */
interface ArbitraryValueSite {
	line: number;
	token: string;
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

type FoldKind = "full" | "partial" | "runtime";

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
				kind: "full",
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
		return { start, kind: "runtime", reason: explain(args), args, name };
	}
	if (dynamicConditional !== undefined) {
		// Partial folding mirrors buildSkeleton exactly: ternaries need
		// both BRANCHES skeletonizable (the test may stay dynamic); an
		// `&&` chain needs only its RIGHT side (the left is the kept-
		// dynamic test). `||` / `??` never partially fold.
		if (!isSkeletonable(dynamicConditional.arg, consts)) {
			return { start, kind: "runtime", reason: "conditional with non-static branches", args, name };
		}
		return { start, kind: "partial", reason: "", args, name };
	}
	// All args static: full fold — unless a css()/unknown helper call is
	// among them without a fold context (the pass leaves those alone).
	const hasUnknownCall = args.some((a) => (a as { type?: string })?.type === "CallExpression");
	if (hasUnknownCall) {
		return { start, kind: "runtime", reason: "unresolved helper call argument", args, name };
	}
	return { start, kind: "full", reason: "", args, name };
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
): FileFoldStats {
	const mod = parseModule(source, file, options.config, options.importedConstants);

	const runtimeSites: Array<CallSite> = [];
	let cxFoldedFull = 0;
	let cxFoldedPartial = 0;
	let cxRuntime = 0;
	let cxTotal = 0;
	let twCalls = 0;
	let twFolded = 0;

	const working = inlineTwCalls(source, file, options.config, options.twNames ?? new Set(["tw"]));
	twFolded = working.inlined;

	const ignore = options.missingCssIgnore;
	const missingCss: Array<MissingCssSite> = [];
	const arbitraryValues: Array<ArbitraryValueSite> = [];
	for (const call of mod.calls) {
		const site = { line: lineOf(mod.lineStarts, call.start), reason: call.reason };
		if (mod.twNames.has(call.name)) {
			twCalls++;
			continue;
		}
		cxTotal++;
		if (call.kind === "full") cxFoldedFull++;
		else if (call.kind === "partial") cxFoldedPartial++;
		else {
			cxRuntime++;
			runtimeSites.push(site);
		}
		// Warnings lane: statically-known strings from full folds (and the
		// static arguments of partial folds — dynamic conditionals keep their
		// branches out of scope here).
		if (call.kind !== "runtime") {
			const values = call.args.map((arg) => evalStaticCx(arg as never, undefined, mod.consts));
			missingCss.push(
				...collectMissingCss(values, mod.lineStarts, call.start, options.config, ignore),
			);
			arbitraryValues.push(...collectArbitraryValues(values, mod.lineStarts, call.start, ignore));
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

/**
 * Missing-CSS warnings lane (inspired by panda's missing-css-warnings
 * plugin): every statically-known class token from folded cx() calls must be
 * a real Tailwind candidate — anything else renders unstyled.
 *
 * A token "has CSS" when, after stripping variant prefixes:
 * - it contains an arbitrary-value bracket (Tailwind compiles those by
 *   construction), or
 * - the generated conflict map knows it (whole-key entry, or utility +
 *   value / opacity-modified value / `*` fallback). The map is derived
 *   from real Tailwind compilation, so membership implies compilability.
 */
const topLevelColon = (token: string): number => {
	let depth = 0;
	for (let i = 0; i < token.length; i++) {
		const char = token[i];
		if (char === "[") depth++;
		else if (char === "]") depth--;
		else if (char === ":" && depth === 0) return i;
	}
	return -1;
};

const tokenHasCss = (token: string, config: TwConfig): boolean => {
	let rest = token;
	for (;;) {
		const colon = topLevelColon(rest);
		if (colon === -1) break;
		const prefix = rest.slice(0, colon);
		// Unknown variant prefix => Tailwind emits nothing for this token.
		if (config.variants?.[prefix] === undefined) return false;
		rest = rest.slice(colon + 1);
	}
	if (rest.includes("[")) return true;
	if (config.conflicts === undefined) return true; // no map => lane disabled
	const conflicts = config.conflicts as Record<string, Record<string, string[]>>;
	const whole = conflicts[rest];
	if (whole !== undefined) return Object.keys(whole).length > 0;
	let i = rest.length;
	for (;;) {
		i = rest.lastIndexOf("-", i - 1);
		if (i <= 0) return false;
		const byValue = conflicts[rest.slice(0, i)];
		if (byValue === undefined) continue;
		const value = rest.slice(i + 1);
		if (byValue[value] !== undefined || byValue["*"] !== undefined) return true;
		const slash = value.lastIndexOf("/");
		if (slash > 0 && slash < value.length - 1 && byValue[value.slice(0, slash)] !== undefined) {
			return true;
		}
	}
};

const collectMissingCss = (
	values: Array<unknown>,
	lineStarts: Array<number>,
	start: number,
	config: TwConfig,
	ignore: ReadonlySet<string> | undefined,
): Array<MissingCssSite> => {
	const sites = new Map<string, MissingCssSite>();
	for (const value of values) {
		if (typeof value !== "string" || value === "") continue;
		for (const token of value.split(/\s+/)) {
			if (token === "" || ignore?.has(token) || tokenHasCss(token, config)) continue;
			sites.set(token, { line: lineOf(lineStarts, start), token });
		}
	}
	return [...sites.values()];
};

/**
 * Off-design-system lane: after stripping variant prefixes, does the utility
 * itself use arbitrary-value bracket syntax? Mirrors the `[` check inside
 * tokenHasCss (arbitrary brackets always compile) but reports instead of
 * passing. Variant prefixes are skipped without validity checking — an
 * arbitrary value under any variant is equally off-system.
 */
const tokenIsArbitrary = (token: string): boolean => {
	let rest = token;
	for (;;) {
		const colon = topLevelColon(rest);
		if (colon === -1) break;
		rest = rest.slice(colon + 1);
	}
	return rest.includes("[");
};

const collectArbitraryValues = (
	values: Array<unknown>,
	lineStarts: Array<number>,
	start: number,
	ignore: ReadonlySet<string> | undefined,
): Array<ArbitraryValueSite> => {
	const sites = new Map<string, ArbitraryValueSite>();
	for (const value of values) {
		if (typeof value !== "string" || value === "") continue;
		for (const token of value.split(/\s+/)) {
			if (token === "" || ignore?.has(token) || !tokenIsArbitrary(token)) continue;
			sites.set(token, { line: lineOf(lineStarts, start), token });
		}
	}
	return [...sites.values()];
};

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
	const config = extractTwConfig(readFileSync(twPath, "utf8"));
	if (config === undefined) {
		throw new Error(`pandwind analyze: could not extract tw config from ${twPath}`);
	}
	return config;
}

/** Collect unique .ts/.tsx files matching globs under root (no node_modules). */
export function collectFiles(patterns: Array<string>, root: string): Array<string> {
	const files = new Set<string>();
	for (const pattern of patterns) {
		const matches = globSync(pattern, { cwd: root }) as unknown[];
		for (const match of matches) {
			if (typeof match !== "string") continue;
			if (match.includes("node_modules")) continue;
			if (!SOURCE_SCANNER_SERVICE.isScriptFile(match)) continue;
			files.add(resolve(root, match));
		}
	}
	return [...files].toSorted();
}

/** Aggregate per-file stats into totals. */
export function summarize(files: Array<FileFoldStats>): FoldSummary {
	const totalCxCalls = files.reduce((acc, f) => acc + f.cxCalls, 0);
	const fullFolded = files.reduce((acc, f) => acc + f.cxFoldedFull, 0);
	const partialFolded = files.reduce((acc, f) => acc + f.cxFoldedPartial, 0);
	const runtimeCalls = files.reduce((acc, f) => acc + f.cxRuntime, 0);
	const totalTwCalls = files.reduce((acc, f) => acc + f.twCalls, 0);
	const twFolded = files.reduce((acc, f) => acc + f.twFolded, 0);
	const eliminated =
		totalCxCalls === 0 ? 100 : Math.round(((fullFolded + partialFolded) / totalCxCalls) * 100);
	// Entry-level metric (matches the vite-cx-coverage harness): a FILE counts
	// as eliminated when every cx call inside it folds. Single-call corpora
	// make both metrics coincide.
	const filesWithCalls = files.filter((f) => f.cxCalls > 0);
	const filesEliminated = filesWithCalls.filter((f) => f.cxRuntime === 0).length;
	const entryEliminatedPct =
		filesWithCalls.length === 0 ? 100 : Math.round((filesEliminated / filesWithCalls.length) * 100);
	const totalMissingCss = files.reduce((acc, f) => acc + f.missingCss.length, 0);
	const totalArbitraryValues = files.reduce((acc, f) => acc + f.arbitraryValues.length, 0);
	return {
		files,
		totalCxCalls,
		fullFolded,
		partialFolded,
		runtimeCalls,
		eliminatedPct: eliminated,
		totalTwCalls,
		twFolded,
		filesEliminated,
		filesWithCalls: filesWithCalls.length,
		entryEliminatedPct,
		totalMissingCss,
		totalArbitraryValues,
	};
}

/** Human-readable report. */
export function formatReport(summary: FoldSummary): string {
	const lines: Array<string> = [];
	lines.push("pandwind analyze — fold coverage");
	lines.push("");
	lines.push(
		`${"file".padEnd(40)} ${"cx full/part/runtime".padStart(20)} ${"tw folded".padStart(12)}`,
	);
	for (const f of summary.files) {
		const cxCell = `${f.cxFoldedFull}/${f.cxFoldedPartial}/${f.cxRuntime}`;
		lines.push(
			`${f.file.slice(0, 40).padEnd(40)} ${cxCell.padStart(20)} ${(f.twFolded + "/" + f.twCalls).padStart(12)}`,
		);
		for (const site of f.runtimeSites) {
			lines.push(`    ^ ${f.file}:${site.line} — ${site.reason}`);
		}
		for (const site of f.missingCss) {
			lines.push(
				`    ^ ${f.file}:${site.line} — missing-css: no Tailwind candidate for "${site.token}"`,
			);
		}
		for (const site of f.arbitraryValues) {
			lines.push(
				`    ^ ${f.file}:${site.line} — off-design-system: "${site.token}" uses an arbitrary value outside the design system`,
			);
		}
	}
	lines.push("");
	lines.push(
		`cx(): ${summary.eliminatedPct}% of ${summary.totalCxCalls} calls eliminated at build time` +
			` (${summary.fullFolded} fully, ${summary.partialFolded} partially; ${summary.runtimeCalls} at runtime)`,
	);
	if (summary.totalTwCalls > 0) {
		lines.push(`tw(): ${summary.twFolded}/${summary.totalTwCalls} calls inlined`);
	}
	if (summary.totalMissingCss > 0) {
		lines.push(
			`missing-css: ${summary.totalMissingCss} static class token(s) with no Tailwind candidate`,
		);
	}
	if (summary.totalArbitraryValues > 0) {
		lines.push(
			`off-design-system: ${summary.totalArbitraryValues} arbitrary-value token(s) outside the design system`,
		);
	}
	return lines.join("\n");
}
