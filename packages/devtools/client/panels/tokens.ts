import { badge, card, emptyState, escapeHtml, type PanelSnapshot } from "./shared.ts";

export function renderTokens(data: PanelSnapshot): string {
	const properties = new Map<string, number>();
	for (const program of data.stylePrograms)
		for (const rule of program.program.rules)
			for (const declaration of rule.declarations)
				properties.set(declaration.property, (properties.get(declaration.property) ?? 0) + 1);
	const rows = data.tokens
		.map(
			(token) =>
				`<tr><td><code>${escapeHtml(token.name)}</code></td><td>${escapeHtml(token.value)}</td><td>${badge(token.kind, "good")}</td><td>${escapeHtml(token.theme ?? "default")}</td><td>${token.files.length}</td></tr>`,
		)
		.join("");
	const body = rows
		? `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Resolved value</th><th>Kind</th><th>Theme</th><th>Files</th></tr></thead><tbody>${rows}</tbody></table></div>`
		: emptyState(
				"No generated token catalog",
				"Generate pandwind.interop.json to make resolved theme variables visible here.",
			);
	const usage = [...properties.entries()]
		.toSorted(([, a], [, b]) => b - a)
		.slice(0, 12)
		.map(
			([property, count]) =>
				`<div class="usage-row"><code>${escapeHtml(property)}</code><span class="usage-bar"><i style="width:${Math.min(100, count * 12)}%"></i></span><b>${count}</b></div>`,
		)
		.join("");
	return `${card("Tokens & themes", "GENERATED ARTIFACTS", body, "wide-card")}${card("Property usage", "STYLEPROGRAM EVIDENCE", usage || emptyState("No property usage", "StyleProgram declarations will rank here as evidence arrives."), "wide-card")}`;
}
