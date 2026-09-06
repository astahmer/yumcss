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
import { type SourceScanResult } from "pandwind/source";
import { type TwConfig } from "pandwind/vite/inline";
import { type ArbitraryValueSite, type CssResidualCollector, type MissingCssSite } from "./css-residual-collector.ts";
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
/**
 * Analyze one module. `file` is only used for reporting (paths as given).
 */
export declare function analyzeSource(source: string, file: string, options: AnalyzeOptions, dependencies?: AnalyzeSourceDependencies): FileFoldStats;
/** Load a generated tw module's config from disk. */
export declare function loadTwConfig(twPath: string): TwConfig;
/** Collect unique TypeScript files through the shared source workspace. */
export declare function collectFiles(patterns: Array<string>, root: string): Array<string>;
