import type { InspectorPayload } from "../types.ts";
import type { TokenReleaseReport } from "@yumcss/analyze/governance/browser";

interface DtcgExportOutput {
	text: string;
	resolverText?: string;
	fidelity: {
		status: "lossless" | "lossy";
		losses: ReadonlyArray<{ path: string; feature: string; reason: string }>;
	};
}

async function fetchData(forceRefresh = false): Promise<InspectorPayload> {
	const res = await fetch(forceRefresh ? "/api/data?refresh=1" : "/api/data", {
		cache: "no-store",
	});
	if (!res.ok) {
		const body = (await res.json().catch(() => ({}))) as { error?: string };
		throw new Error(body.error ?? `inspector api failed: ${res.status}`);
	}
	return (await res.json()) as InspectorPayload;
}

const vscodeLink = (root: string, file: string, line: number): string =>
	`vscode://file/${root}/${file}:${line}`;

/** Source link used by provenance views; columns are one-based for editors. */
const vscodeLinkAt = (root: string, file: string, line: number, column: number): string =>
	`vscode://file/${root}/${file}:${line}:${column}`;

const kb = (bytes: number): string => `${(bytes / 1024).toFixed(2)} KB`;

export interface HistoryListItem {
	timestamp: string;
	parent: string | null;
}

async function fetchHistoryList(): Promise<Array<HistoryListItem>> {
	const res = await fetch("/api/history");
	if (!res.ok) throw new Error(`history api failed: ${res.status}`);
	return (await res.json()) as Array<HistoryListItem>;
}

async function fetchHistoryRun(timestamp: string): Promise<InspectorPayload> {
	const res = await fetch(`/api/history?run=${encodeURIComponent(timestamp)}`);
	if (!res.ok) throw new Error(`history api failed: ${res.status}`);
	const body = (await res.json()) as InspectorPayload & { error?: string };
	if (body.error !== undefined) throw new Error(body.error);
	return body;
}

interface PruneChangeset {
	count: number;
	content: string | null;
}

async function fetchPruneChangeset(): Promise<PruneChangeset> {
	const res = await fetch("/api/analytics/prune-changeset", { method: "POST" });
	if (!res.ok) throw new Error(`prune-changeset api failed: ${res.status}`);
	return (await res.json()) as PruneChangeset;
}

export interface AnalyticsHistoryPoint {
	timestamp: string;
	eliminatedPct: number;
	totalCalls: number;
	sitesScanned: number | null;
	unusedTokens: number | null;
}

async function fetchAnalyticsHistory(): Promise<Array<AnalyticsHistoryPoint>> {
	const res = await fetch("/api/analytics/history");
	if (!res.ok) throw new Error(`analytics history api failed: ${res.status}`);
	return (await res.json()) as Array<AnalyticsHistoryPoint>;
}

async function exportTokensDtcg(): Promise<DtcgExportOutput> {
	const response = await fetch("/api/tokens/export", { method: "POST" });
	const body = (await response.json()) as DtcgExportOutput & { error?: string };
	if (!response.ok) throw new Error(body.error ?? `token export failed: ${response.status}`);
	return body;
}

async function compareTokenRelease(baselineText: string): Promise<TokenReleaseReport> {
	const response = await fetch("/api/tokens/release", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ baselineText }),
	});
	const body = (await response.json()) as TokenReleaseReport & { error?: string };
	if (!response.ok)
		throw new Error(body.error ?? `token release comparison failed: ${response.status}`);
	return body;
}

/** Single inspector transport facade; endpoint functions remain private seams. */
export const InspectorApi = {
	fetchData,
	fetchHistoryList,
	fetchHistoryRun,
	fetchPruneChangeset,
	fetchAnalyticsHistory,
	exportTokensDtcg,
	compareTokenRelease,
	vscodeLink,
	vscodeLinkAt,
	kb,
} as const;
