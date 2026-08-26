/** Shared payload contract between the node-side gatherer and the UI. */

export type TokenTier = "raw" | "semantic" | "scope" | "component";

export interface TokenGraphNode {
	id: string;
	tier: TokenTier;
	label: string;
}

export interface TokenGraphEdge {
	from: string;
	to: string;
}

export interface TokenGraph {
	nodes: Array<TokenGraphNode>;
	edges: Array<TokenGraphEdge>;
	cycles: Array<Array<string>>;
	orphans: Array<string>;
	reachability: Record<string, Array<string>>;
	dangling: Array<string>;
}

export interface ThemeVar {
	name: string;
	value: string;
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

/** WCAG contrast finding for one foreground/background pair in one file. */
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

/** One persisted point of the studio analytics time series. */
export interface AnalyticsHistoryPoint {
	timestamp: string;
	eliminatedPct: number;
	totalCalls: number;
	sitesScanned: number | null;
	unusedTokens: number | null;
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

export interface StudioPayload {
	meta: { root: string };
	analytics?: import("./server/analytics.ts").StyleUsageReport;
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
	tokenGraph: TokenGraph;
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
