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
