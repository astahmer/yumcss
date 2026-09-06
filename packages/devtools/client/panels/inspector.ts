import { badge, card, emptyState, escapeHtml, type PanelSnapshot } from "./shared.ts";

export function renderInspector(data: PanelSnapshot): string {
	const selected = data.selected;
	const selection = selected
		? `<div class="selection-grid">
			<div><span class="field-label">Element</span><code>${escapeHtml(selected.tagName ?? "unknown")}</code></div>
			<div><span class="field-label">className</span><code>${escapeHtml(selected.className ?? "—")}</code></div>
			<div><span class="field-label">Files</span><strong>${selected.matchedFiles.length}</strong></div>
			<div><span class="field-label">Programs</span><strong>${selected.matchedPrograms.length}</strong></div>
		</div>
		<div class="chip-row">${selected.classNames.map((name) => `<span class="chip">.${escapeHtml(name)}</span>`).join("")}${Object.entries(
			selected.attributes,
		)
			.map(
				([key, value]) =>
					`<span class="chip"><b>${escapeHtml(key)}</b> ${escapeHtml(value)}</span>`,
			)
			.join("")}</div>`
		: emptyState(
				"Nothing selected",
				"Open the Inspect styles action in Vite DevTools, then click an element in the running app.",
			);
	const computed =
		selected && Object.keys(selected.computedStyles).length > 0
			? `<div class="table-wrap"><table><thead><tr><th>Computed property</th><th>Value</th></tr></thead><tbody>${Object.entries(
					selected.computedStyles,
				)
					.map(
						([property, value]) =>
							`<tr><td><code>${escapeHtml(property)}</code></td><td>${escapeHtml(value)}</td></tr>`,
					)
					.join("")}</tbody></table></div>`
			: emptyState(
					"No computed style sample",
					"The host action captures the selected element's relevant computed properties.",
				);
	const recent = data.stylePrograms
		.slice(0, 6)
		.map((program) => {
			const declarations = program.program.rules.reduce(
				(count, rule) => count + rule.declarations.length,
				0,
			);
			return `<div class="list-row"><div><strong>${escapeHtml(program.label ?? program.id)}</strong><small>${escapeHtml(program.file ?? "generated evidence")}</small></div>${badge(`${declarations} declarations`, "good")}</div>`;
		})
		.join("");
	return `${card("Element inspector", "LIVE SELECTION", selection, "hero-card")}${card("Computed style sample", "BROWSER EVIDENCE", computed, "wide-card")}${card("Recent style programs", "STYLEPROGRAM IR", recent || emptyState("No programs yet", "Run a migration preview or use a Pandwind compiler integration to populate style evidence."))}`;
}
