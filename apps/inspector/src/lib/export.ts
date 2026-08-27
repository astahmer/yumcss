/**
 * Studio export serializers — pure functions over the studio payload so
 * they unit-test without DOM or server. The only DOM touchpoint is
 * `downloadFile`, called exclusively from UI event handlers.
 */
import type { StudioPayload, ThemeVar, UtilityUnion } from "../types.ts";

/** Best-effort DTCG token type from a value's shape. */
const tokenTypeOf = (value: string): string => {
	if (/^(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|oklch\(|lab\(|color\()/.test(value)) return "color";
	if (/^-?\d*\.?\d+(px|rem|em|%|vh|vw|ch|ex)$/.test(value)) return "dimension";
	return "other";
};

/**
 * Token sections as a DTCG-compatible document. Condition-bound values
 * (stored as JSON strings) keep their raw string form under `"type":
 * "other"` — DTCG has no conditional-value concept, so nothing is invented.
 */
export function tokensToDtcg(data: StudioPayload): string {
	const doc: Record<string, Record<string, { value: string; type: string }>> = {};
	for (const section of data.designSystem.tokenSections) {
		const group: Record<string, { value: string; type: string }> = {};
		for (const entry of section.entries) {
			group[entry.name] = { value: entry.value, type: tokenTypeOf(entry.value) };
		}
		doc[section.id] = group;
	}
	return `${JSON.stringify(doc, null, "\t")}\n`;
}

/** @theme vars as a plain `:root` custom-properties stylesheet. */
export function themeVarsToCss(data: StudioPayload): string {
	const lines = data.designSystem.themeVars.map((v: ThemeVar) => `\t${v.name}: ${v.value};`);
	return lines.length === 0 ? "" : `:root {\n${lines.join("\n")}\n}\n`;
}

/** Utility unions summary (counts, samples, open-ended flags). */
export function utilitiesToJson(data: StudioPayload): string {
	const doc = {
		variantCount: data.designSystem.variantCount,
		conflictUtilities: data.designSystem.conflictUtilities,
		composeUtilities: data.designSystem.composeUtilities,
		bridgeProperties: data.designSystem.bridgeProperties,
		bridgeMappings: data.designSystem.bridgeMappings,
		unions: data.designSystem.utilities.map((u: UtilityUnion) => ({
			key: u.key,
			count: u.count,
			sample: u.sample,
			openEnded: u.openEnded,
		})),
	};
	return `${JSON.stringify(doc, null, "\t")}\n`;
}

/** The coverage/stats slice verbatim (machine-readable). */
export function coverageToJson(data: StudioPayload): string {
	return `${JSON.stringify(data.coverage, null, "\t")}\n`;
}

/** Human-readable Markdown report: summary, per-file stats, warnings. */
export function coverageToMarkdown(data: StudioPayload): string {
	const c = data.coverage;
	const lines: Array<string> = ["# pandwind studio report", ""];

	lines.push("## Fold coverage", "");
	lines.push("| metric | value |", "| --- | --- |");
	lines.push(`| eliminated | ${c.eliminatedPct}% (${c.entryEliminatedPct}% entry-level) |`);
	lines.push(
		`| cx calls | ${c.totalCxCalls} (${c.fullFolded} full, ${c.partialFolded} partial, ${c.runtimeCalls} runtime) |`,
	);
	lines.push(`| tw calls folded | ${c.twFolded}/${c.totalTwCalls} |`);

	lines.push("", "## Per-file stats", "");
	lines.push("| file | eliminated % | cx calls | missing css |", "| --- | --- | --- | --- |");
	for (const f of c.files) {
		lines.push(
			`| ${f.file} | ${f.eliminatedPct}% | ${f.cxRuntime === 0 && f.cxCalls === 0 ? "—" : `${f.cxFoldedFull}/${f.cxFoldedPartial}/${f.cxRuntime}`} | ${f.missingCssCount} |`,
		);
	}

	if (c.missingCssSites.length > 0) {
		lines.push("", "## Missing-css sites", "");
		for (const s of c.missingCssSites) lines.push(`- \`${s.file}:${s.line}\` — \`${s.token}\``);
	}
	if (c.runtimeSites.length > 0) {
		lines.push("", "## Runtime call sites", "");
		for (const s of c.runtimeSites) lines.push(`- \`${s.file}:${s.line}\``);
	}

	lines.push("", "## CSS budget", "");
	lines.push(
		`generated: ${(c.budget.cssBytes / 1024).toFixed(2)} KB min / ${(c.budget.cssGzipBytes / 1024).toFixed(2)} KB gzip · ${c.budget.rules} rules · live/dead candidates: ${c.budget.liveCandidates}/${c.budget.deadCandidates}`,
	);
	if (c.budget.perPrefix.length > 0) {
		lines.push("", "| prefix | rules |", "| --- | --- |");
		for (const p of c.budget.perPrefix) lines.push(`| ${p.prefix} | ${p.rules} |`);
	}

	return `${lines.join("\n")}\n`;
}

/** Client-side file download via Blob + anchor click. UI-only. */
export function downloadFile(filename: string, content: string, mime = "application/json"): void {
	const blob = new Blob([content], { type: mime });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}

const htmlEsc = (value: string): string =>
	value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Self-contained HTML report (wallace-style): the whole studio payload
 * rendered into one static file — shareable offline, no server needed.
 */
export function coverageToHtml(data: StudioPayload, generatedAt: string): string {
	const c = data.coverage;
	const row = (cells: Array<string>): string =>
		`<tr>${cells.map((cell) => `<td>${htmlEsc(cell)}</td>`).join("")}</tr>`;
	const files = c.files
		.map((f) =>
			row([
				f.file,
				`${f.cxFoldedFull}/${f.cxFoldedPartial}/${f.cxRuntime}`,
				f.missingCssCount > 0 ? String(f.missingCssCount) : "",
			]),
		)
		.join("\n");
	const missing = c.missingCssSites.length
		? c.missingCssSites.map((m) => row([m.file, String(m.line), m.token])).join("\n")
		: `<tr><td colspan="3">none</td></tr>`;
	return `<!doctype html>
<html><head><meta charset="utf-8"><title>pandwind report</title>
<style>
	body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 2rem; background: #101014; color: #e8e8ea; }
	h1 { font-size: 1.4rem; } h2 { font-size: 1.1rem; margin-top: 2rem; }
	table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
	td, th { text-align: left; padding: 0.35rem 0.6rem; border-bottom: 1px solid #26262c; }
	th { color: #9a9aa2; font-weight: 500; }
	.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; }
	.card { background: #17171c; border-radius: 8px; padding: 1rem; }
	.card b { display: block; font-size: 1.5rem; }
	code { color: #7cc4ff; }
</style></head><body>
<h1>pandwind report <small style="color:#777">${htmlEsc(generatedAt)}</small></h1>
<div class="cards">
	<div class="card"><b>${c.eliminatedPct}%</b>cx eliminated (${c.totalCxCalls} calls)</div>
	<div class="card"><b>${c.twFolded}/${c.totalTwCalls}</b>tw calls inlined</div>
	<div class="card"><b>${(c.budget.cssBytes / 1024).toFixed(2)} KB</b>CSS min (${(c.budget.cssGzipBytes / 1024).toFixed(2)} KB gz)</div>
	<div class="card"><b>${c.budget.rules}</b>rules · ${c.budget.deadCandidates} dead candidates</div>
	<div class="card"><b>${c.totalMissingCss}</b>missing-css sites</div>
</div>
<h2>Per-file fold coverage</h2>
<table><tr><th>file</th><th>cx full/partial/runtime</th><th>missing-css</th></tr>
${files}</table>
<h2>Missing CSS</h2>
<table><tr><th>file</th><th>line</th><th>token</th></tr>
${missing}</table>
</body></html>
`;
}

/** Single export boundary for the inspector; serializers remain pure functions. */
export class InspectorExport {
	static readonly tokensToDtcg = tokensToDtcg;
	static readonly themeVarsToCss = themeVarsToCss;
	static readonly utilitiesToJson = utilitiesToJson;
	static readonly coverageToJson = coverageToJson;
	static readonly coverageToMarkdown = coverageToMarkdown;
	static readonly coverageToHtml = coverageToHtml;
	static readonly downloadFile = downloadFile;
}
