import { badge, card, emptyState, escapeHtml, type PanelSnapshot } from "./shared.ts";
import type { DevtoolsMigrationPreview } from "../../src/rpc.ts";

export interface MigrationCatalogEntry {
	readonly id: string;
	readonly officialApi?: string;
}

export function renderMigration(
	data: PanelSnapshot,
	migration: DevtoolsMigrationPreview | undefined,
	catalog: readonly MigrationCatalogEntry[],
): string {
	const last = migration ?? data.migrations[0];
	const optionsFor = (selected: string): string =>
		catalog
			.map(
				(entry) =>
					`<option value="${escapeHtml(entry.id)}"${entry.id === selected ? " selected" : ""}>${escapeHtml(entry.id)}</option>`,
			)
			.join("");
	const sourceOptions = optionsFor("styled-components");
	const targetOptions = optionsFor("pandwind");
	const result = last
		? `<div class="migration-result"><div class="metric-strip"><div><span>Files</span><strong>${last.files.length}</strong></div><div><span>Changed</span><strong>${last.files.filter((file) => file.changed).length}</strong></div><div><span>Residuals</span><strong class="${last.files.some((file) => file.residuals.length > 0) ? "metric-warn" : ""}">${last.files.reduce((count, file) => count + file.residuals.length, 0)}</strong></div></div>${last.files.map((file) => `<details class="diff-block" open><summary>${escapeHtml(file.file)} ${file.changed ? badge("changed", "good") : badge("unchanged")}</summary><pre>${escapeHtml(file.diff || "No source changes")}</pre>${file.generatedFiles.length > 0 ? `<div class="generated-files">${file.generatedFiles.map((generated) => `<span class="chip"><b>generated</b>${escapeHtml(generated.path)}</span>`).join("")}</div>` : ""}</details>`).join("")}</div>`
		: emptyState(
				"No preview yet",
				"Preview a registered source → target route. The panel never writes files.",
			);
	return `${card("Migration lab", "READ-ONLY PREVIEW", `<form id="migration-form" class="migration-form"><label>Files or globs<input name="files" value="src/**/*.{ts,tsx}" /></label><label>From<select name="from">${sourceOptions || '<option value="styled-components">styled-components</option>'}</select></label><label>To<select name="to">${targetOptions || '<option value="pandwind">pandwind</option>'}</select></label><label>Mode<select name="mode"><option value="safe">safe</option><option value="partial">partial</option></select></label><button type="submit" class="primary-button">Preview migration <span>↗</span></button></form>${result}`, "wide-card")}`;
}
