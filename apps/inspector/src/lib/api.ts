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
