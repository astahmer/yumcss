import type { Root } from "postcss";

export interface CssBudgetInput {
	readonly files: readonly string[];
	readonly twEntry: string;
	readonly themeCss?: string;
	readonly base: string;
}

/** Finds source candidates without knowing how the target compiler emits CSS. */
export interface CssCandidateScanner {
	scan(input: CssBudgetInput): Promise<readonly string[]>;
}

/** Compiles candidates into a parseable artifact for the metrics policy. */
export interface CssArtifactCompiler {
	compile(input: CssBudgetInput, candidates: readonly string[]): Promise<Root>;
}

/**
 * Budget result semantics: live/dead refer to scanned candidates, while byte
 * and rule counts describe the compiler artifact. Keeping those domains
 * separate prevents source heuristics from being mistaken for CSS evidence.
 */
export interface CssBudget {
	/** Classes scanned from source that produced at least one rule. */
	liveCandidates: number;
	/** Scanned classes that produced no rules (unknown/dead utilities). */
	deadCandidates: number;
	/** Sample of dead candidates (bounded, for the report). */
	deadSample: Array<string>;
	/** Generated CSS bytes (minified by Tailwind). */
	cssBytes: number;
	/** Gzipped CSS bytes. */
	cssGzipBytes: number;
	/** Number of rules in the compiled sheet. */
	rules: number;
	/** Component scope-block rules (`.pwc-*`) present in the theme bridge. */
	componentScopeRules: number;
	/** Rules per top-level utility prefix (`bg`, `flex`, `md:hover:bg`…), top 15. */
	perPrefix: Array<{ prefix: string; rules: number }>;
	/** Per-theme-scope extra cost, when a theme bridge was supplied. */
	themeScopes: Array<{ scope: string; bytes: number; vars: number }>;
}

export interface CssBudgetMetrics {
	measure(root: Root, candidates: readonly string[], themeCss?: string): CssBudget;
}
