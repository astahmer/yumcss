import type { StudioPayload } from "../types.ts";

export async function fetchData(): Promise<StudioPayload> {
	const res = await fetch("/api/data");
	if (!res.ok) {
		const body = (await res.json().catch(() => ({}))) as { error?: string };
		throw new Error(body.error ?? `studio api failed: ${res.status}`);
	}
	return (await res.json()) as StudioPayload;
}

export const vscodeLink = (root: string, file: string, line: number): string =>
	`vscode://file/${root}/${file}:${line}`;

/** Source link used by provenance views; columns are one-based for editors. */
export const vscodeLinkAt = (root: string, file: string, line: number, column: number): string =>
	`vscode://file/${root}/${file}:${line}:${column}`;

export const kb = (bytes: number): string => `${(bytes / 1024).toFixed(2)} KB`;

export interface HistoryListItem {
	timestamp: string;
	parent: string | null;
}

export async function fetchHistoryList(): Promise<Array<HistoryListItem>> {
	const res = await fetch("/api/history");
	if (!res.ok) throw new Error(`history api failed: ${res.status}`);
	return (await res.json()) as Array<HistoryListItem>;
}

export async function fetchHistoryRun(timestamp: string): Promise<StudioPayload> {
	const res = await fetch(`/api/history?run=${encodeURIComponent(timestamp)}`);
	if (!res.ok) throw new Error(`history api failed: ${res.status}`);
	const body = (await res.json()) as StudioPayload & { error?: string };
	if (body.error !== undefined) throw new Error(body.error);
	return body;
}

export interface PruneChangeset {
	count: number;
	content: string | null;
}

export async function fetchPruneChangeset(): Promise<PruneChangeset> {
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

export async function fetchAnalyticsHistory(): Promise<Array<AnalyticsHistoryPoint>> {
	const res = await fetch("/api/analytics/history");
	if (!res.ok) throw new Error(`analytics history api failed: ${res.status}`);
	return (await res.json()) as Array<AnalyticsHistoryPoint>;
}

/** Single inspector transport facade; endpoint functions remain private seams. */
export const InspectorApi = {
	fetchData,
	fetchHistoryList,
	fetchHistoryRun,
	fetchPruneChangeset,
	fetchAnalyticsHistory,
	vscodeLink,
	vscodeLinkAt,
	kb,
} as const;
