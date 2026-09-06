import { badge, card, emptyState, escapeHtml, type PanelSnapshot } from "./shared.ts";

export function renderDiagnostics(data: PanelSnapshot): string {
	const rows = data.diagnostics
		.map(
			(diagnostic) =>
				`<div class="diagnostic-row"><span class="severity severity-${diagnostic.severity}"></span><div><strong>${escapeHtml(diagnostic.message)}</strong><small>${escapeHtml(diagnostic.file ?? "project")} · ${escapeHtml(diagnostic.source)}</small></div>${badge(diagnostic.severity, diagnostic.severity === "error" ? "warn" : "quiet")}</div>`,
		)
		.join("");
	const residuals = data.migrations
		.flatMap((migrationRecord) =>
			migrationRecord.residuals > 0
				? [
						`<div class="diagnostic-row"><span class="severity severity-warn"></span><div><strong>${escapeHtml(migrationRecord.from)} → ${escapeHtml(migrationRecord.to)}</strong><small>${escapeHtml(migrationRecord.files.join(", "))}</small></div>${badge(`${migrationRecord.residuals} residuals`, "warn")}</div>`,
					]
				: [],
		)
		.join("");
	return card(
		"Diagnostics & residuals",
		"ACTIONABLE EVIDENCE",
		rows + residuals ||
			emptyState(
				"No diagnostics",
				"The current development session has no scanner or migration diagnostics.",
			),
		"wide-card",
	);
}
