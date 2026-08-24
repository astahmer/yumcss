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
