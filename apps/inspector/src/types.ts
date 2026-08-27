/** Shared payload contract — canonical definitions live in the collection
 * layer; re-exported here so UI imports stay unchanged. */
import type { CollectPayload } from "pandwind-analyze/collect";

export type StudioPayload = Omit<CollectPayload, "tokenGraph"> & {
	tokenGraph: TokenGraph;
};

export type { ThemeVar, TokenSection, UtilityUnion } from "pandwind-analyze/collect";

/* ------------------------- inspector-local types ------------------------- */

export type TokenTier = "raw" | "semantic" | "scope" | "component";

interface TokenGraphNode {
	id: string;
	tier: TokenTier;
	label: string;
}

interface TokenGraphEdge {
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

/** One persisted point of the studio analytics time series. */
export interface AnalyticsHistoryPoint {
	timestamp: string;
	eliminatedPct: number;
	totalCalls: number;
	sitesScanned: number | null;
	unusedTokens: number | null;
}
