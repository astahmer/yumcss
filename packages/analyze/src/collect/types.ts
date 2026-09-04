/**
 * Shared collection-layer payload contract (plans/023 unification).
 *
 * `CollectPayload` is the neutral shape produced by gather() here and
 * consumed by apps/inspector (which aliases it as StudioPayload for its UI).
 * Everything in this file moved verbatim from apps/inspector/src/types.ts —
 * signatures unchanged.
 */

export interface ThemeVar {
	name: string;
	value: string;
	/** CSS selector scope for an override outside `@theme`, when present. */
	scope?: string;
}

export interface UsageCount {
	name: string;
	count: number;
}

export interface ConditionUsage {
	name: string;
	count: number;
	kind: "responsive" | "pseudo" | "media" | "other";
}

export interface StyleUsageReport {
	sitesScanned: number;
	tokenUsage: UsageCount[];
	unusedTokens: string[];
	topProperties: UsageCount[];
	topPropertyValues: Array<{ combo: string; count: number }>;
	conditions: ConditionUsage[];
	conditionBreakdown: Record<"responsive" | "pseudo" | "media" | "other", number>;
}

export interface ContrastWarning {
	file: string;
	/** Authored values as written (tokens stay tokens). */
	fg: string;
	bg: string;
	/** WCAG contrast ratio, rounded to 2 decimals. */
	ratio: number;
	/** "fail-large" = below even the 3.0 large-text threshold. */
	severity: "fail-normal" | "fail-large";
}

export interface UtilityUnion {
	key: string;
	count: number;
	sample: Array<string>;
	/** True when the union carries the `(string & {})` escape hatch. */
	openEnded: boolean;
}

export interface TokenSection {
	id: string;
	label: string;
	entries: Array<{ name: string; value: string }>;
}

export interface CoverageFile {
	file: string;
	eliminatedPct: number;
	cxCalls: number;
	cxFoldedFull: number;
	cxFoldedPartial: number;
	cxRuntime: number;
	missingCssCount: number;
}

export interface MissingSite {
	file: string;
	line: number;
	token: string;
}

export interface ShapeCategory {
	category: string;
	rules: number;
	bytes: number;
	topValues: Array<{ value: string; count: number }>;
}

export interface SpecificityBucket {
	label: string;
	rules: number;
}

export interface SheetShape {
	totalRules: number;
	totalBytes: number;
	categories: Array<ShapeCategory>;
	specificity: Array<SpecificityBucket>;
}

export type { CssCallSite, CssDiagnostic, CssDiagnosticKind } from "../css-diagnostics.ts";
export type { AuthoredCssImport } from "../css-diagnostics.ts";
export type { TokenGovernanceReport } from "../governance/contracts.ts";
export type { GovernancePruneChangeset } from "../governance/prune-changeset.ts";

export interface CollectPayload {
	meta: { root: string };
	authoredCss: Array<import("../css-diagnostics.ts").AuthoredCssImport>;
	cssSources: Array<import("../css-diagnostics.ts").CssCallSite>;
	cssDiagnostics: Array<import("../css-diagnostics.ts").CssDiagnostic>;
	analytics?: StyleUsageReport;
	/** Token governance report (plans/054) — computed when the app's
	 * official preset is loadable; report-only when it is not. */
	governance?: import("../governance/contracts.ts").TokenGovernanceReport;
	/** Deterministic prune-changeset proposal derived from the report. */
	governanceChangeset?: import("../governance/prune-changeset.ts").GovernancePruneChangeset;
	cssCrawl?: {
		files: number;
		unresolved: Array<{ from: string; specifier: string }>;
	};
	coverage: {
		eliminatedPct: number;
		entryEliminatedPct: number;
		totalCxCalls: number;
		fullFolded: number;
		partialFolded: number;
		runtimeCalls: number;
		totalTwCalls: number;
		twFolded: number;
		totalMissingCss: number;
		files: Array<CoverageFile>;
		runtimeSites: Array<MissingSite>;
		missingCssSites: Array<MissingSite>;
		budget: {
			cssBytes: number;
			cssGzipBytes: number;
			rules: number;
			liveCandidates: number;
			deadCandidates: number;
			deadSample: Array<string>;
			perPrefix: Array<{ prefix: string; rules: number }>;
		};
		shape: SheetShape;
	};
	classDrillDown: Array<{
		candidate: string;
		rules: Array<{ selector: string; declarations: string }>;
	}>;
	contrastWarnings?: ContrastWarning[];
	/** Inspector-side token graph (built by the app via pandwind/token-graph). */
	tokenGraph: unknown;
	designSystem: {
		themeVars: Array<ThemeVar>;
		utilities: Array<UtilityUnion>;
		variantCount: number;
		conflictUtilities: number;
		composeUtilities: number;
		bridgeProperties: number;
		bridgeMappings: number;
		tokenSections: Array<TokenSection>;
	};
}
