import type { FileFoldStats, FoldSummary } from "./analyze.ts";
/** Aggregate per-file analysis into a stable machine-readable summary. */
export declare function summarize(files: Array<FileFoldStats>): FoldSummary;
/** Human-readable report renderer, independent from analysis execution. */
export declare function formatReport(summary: FoldSummary): string;
