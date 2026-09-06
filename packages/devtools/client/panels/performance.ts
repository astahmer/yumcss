import { card, emptyState, escapeHtml, shortPath, type PanelSnapshot } from "./shared.ts";

export function renderPerformance(data: PanelSnapshot): string {
	const totalBytes = data.transforms.reduce((sum, item) => sum + item.bytes, 0);
	const totalMs = data.transforms.reduce((sum, item) => sum + item.durationMs, 0);
	const rows = data.transforms
		.map(
			(item) =>
				`<tr><td><code>${escapeHtml(shortPath(item.file))}</code></td><td>${item.bytes.toLocaleString()} B</td><td>${item.durationMs.toFixed(2)} ms</td><td>${item.transformCount}</td></tr>`,
		)
		.join("");
	return card(
		"Build & runtime performance",
		"DEV SERVER EVIDENCE",
		`<div class="metric-strip"><div><span>Modules</span><strong>${data.transforms.length}</strong></div><div><span>Source bytes</span><strong>${totalBytes.toLocaleString()}</strong></div><div><span>Scan time</span><strong>${totalMs.toFixed(1)} ms</strong></div><div><span>HMR events</span><strong>${data.runtime.filter((event) => event.event === "hmr-update").length}</strong></div></div>${rows ? `<div class="table-wrap"><table><thead><tr><th>Module</th><th>Size</th><th>Transform</th><th>Runs</th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyState("No module timings", "Edit a source file or start the Vite app to collect timings.")}`,
		"wide-card",
	);
}
