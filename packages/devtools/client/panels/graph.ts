import {
	card,
	emptyState,
	escapeHtml,
	renderTree,
	shortPath,
	type PanelSnapshot,
} from "./shared.ts";

export function renderGraph(data: PanelSnapshot): string {
	const rows = data.stylePrograms
		.map((program) => {
			const declarations = program.program.rules.reduce(
				(count, rule) => count + rule.declarations.length,
				0,
			);
			return `<div class="graph-row"><div class="node node-file">${escapeHtml(shortPath(program.file ?? "runtime"))}</div><span class="edge">→</span><div class="node node-program"><b>${escapeHtml(program.label ?? program.id)}</b><small>${program.program.rules.length} rules · ${declarations} declarations</small></div></div>`;
		})
		.join("");
	const trees = data.stylePrograms
		.map(
			(program) =>
				`<div class="ir-view"><div class="ir-title"><strong>${escapeHtml(program.label ?? program.id)}</strong><span>${escapeHtml(program.file ?? "runtime")}</span></div>${renderTree(program.program, "StyleProgram")}</div>`,
		)
		.join("");
	const rawPrograms = data.stylePrograms
		.map(
			(program) =>
				`<details class="raw-block"><summary>${escapeHtml(program.id)} <span>${program.program.rules.length} rules</span></summary><pre>${escapeHtml(JSON.stringify(program.program, null, 2))}</pre></details>`,
		)
		.join("");
	return `${card("Style graph", "PROVENANCE", rows || emptyState("No graph edges", "Style programs appear here after a compiler or migration produces inspectable IR."), "wide-card")}${card("Interactive IR", "STYLEPROGRAM TREE", trees || emptyState("No IR available", "The tree expands from the schema down to conditions, declarations, values, and children."), "wide-card")}${card("Raw JSON fallback", "SERIALIZED IR", rawPrograms || emptyState("No raw IR available", "The serialized representation stays available for copying and debugging."), "wide-card")}`;
}
