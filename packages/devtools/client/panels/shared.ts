import type { DevtoolsEvidenceSnapshot } from "../../src/evidence/store.ts";

export type PanelSnapshot = DevtoolsEvidenceSnapshot;

export const escapeHtml = (value: unknown): string =>
	String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");

export const shortPath = (value: string): string =>
	value.replaceAll("\\", "/").split("/").slice(-3).join("/");

export function badge(label: string, tone: "good" | "warn" | "quiet" = "quiet"): string {
	return `<span class="badge badge-${tone}">${escapeHtml(label)}</span>`;
}

export function emptyState(title: string, detail: string): string {
	return `<div class="empty-state"><span class="empty-mark">∅</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div>`;
}

export function card(title: string, eyebrow: string, body: string, extra = ""): string {
	return `<section class="card ${extra}"><div class="card-head"><div><span class="eyebrow">${escapeHtml(eyebrow)}</span><h2>${escapeHtml(title)}</h2></div></div>${body}</section>`;
}

export function renderTree(value: unknown, label: string, depth = 0): string {
	if (value === null || typeof value !== "object")
		return `<div class="tree-leaf"><span class="tree-key">${escapeHtml(label)}</span><span class="tree-value tree-${typeof value}">${escapeHtml(value)}</span></div>`;
	const entries = Array.isArray(value)
		? value.map((entry, index) => [String(index), entry] as const)
		: Object.entries(value);
	const children = entries.map(([key, entry]) => renderTree(entry, key, depth + 1)).join("");
	const kind = Array.isArray(value) ? `array · ${value.length}` : `object · ${entries.length}`;
	return `<details class="tree-node" ${depth < 2 ? "open" : ""}><summary><span class="tree-key">${escapeHtml(label)}</span><span class="tree-meta">${kind}</span></summary><div class="tree-children">${children}</div></details>`;
}
