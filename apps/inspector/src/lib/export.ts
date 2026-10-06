/**
 * Inspector export serializers — pure functions over its payload so
 * they unit-test without DOM or server. The only DOM touchpoint is
 * `downloadFile`, called exclusively from UI event handlers.
 */
import type { InspectorPayload, ThemeVar, UtilityUnion } from "../types.ts";
import {
	serializeDtcgTokenDocument,
	serializeTokenResolverDocument,
} from "@yumcss/codemod/swap/token-document/serializer";

/** Export only the source-validated generated token snapshot. */
export function tokensToDtcg(data: InspectorPayload): string {
	const tokens = data.interopTokens;
	if (tokens?.state !== "available") {
		throw new Error(tokens?.diagnostics.join("; ") ?? "No validated token snapshot is available.");
	}
	return serializeDtcgTokenDocument(tokens.document);
}

/** Resolver data stays in its own DTCG sidecar document. */
export function tokensResolverToDtcg(data: InspectorPayload): string | undefined {
	const tokens = data.interopTokens;
	if (tokens?.state !== "available" || tokens.document.resolver === undefined) return undefined;
	return serializeTokenResolverDocument(tokens.document.resolver);
}

/** @theme vars as a plain `:root` custom-properties stylesheet. */
export function themeVarsToCss(data: InspectorPayload): string {
	const groups = new Map<string, Array<ThemeVar>>();
	for (const variable of data.designSystem.themeVars) {
		const scope = variable.scope ?? ":root";
		const entries = groups.get(scope) ?? [];
		entries.push(variable);
		groups.set(scope, entries);
	}
	if (groups.size === 0) return "";
	const blocks = [...groups.entries()].map(
		([scope, variables]) =>
			`${scope} {\n${variables.map((v) => `\t${v.name}: ${v.value};`).join("\n")}\n}`,
	);
	return `${blocks.join("\n")}\n`;
}

/** Utility unions summary (counts, samples, open-ended flags). */
export function utilitiesToJson(data: InspectorPayload): string {
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
export function coverageToJson(data: InspectorPayload): string {
	return `${JSON.stringify(data.coverage, null, "\t")}\n`;
}

const csvCell = (value: string | number): string => {
	const text = String(value);
	return /[",\n]/u.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Per-file fold and authored-value coverage for spreadsheets and CI artifacts. */
export function coverageToCsv(data: InspectorPayload): string {
	const coverageByFile = new Map(
		(data.analytics?.fileValueCoverage ?? []).map((coverage) => [coverage.file, coverage]),
	);
	const header = [
		"file",
		"eliminated_pct",
		"cx_calls",
		"cx_folded_full",
		"cx_folded_partial",
		"cx_runtime",
		"token_pct",
		"literal_pct",
		"dynamic_values",
		"missing_css",
	];
	const rows = data.coverage.files.map((file) => {
		const valueCoverage = coverageByFile.get(file.file);
		return [
			file.file,
			file.eliminatedPct,
			file.cxCalls,
			file.cxFoldedFull,
			file.cxFoldedPartial,
			file.cxRuntime,
			valueCoverage?.tokenPct ?? "",
			valueCoverage?.literalPct ?? "",
			valueCoverage?.dynamicValues ?? "",
			file.missingCssCount,
		].map(csvCell);
	});
	return `${[header.map(csvCell), ...rows].map((row) => row.join(",")).join("\n")}\n`;
}

/** Human-readable Markdown report: summary, per-file stats, warnings. */
export function coverageToMarkdown(data: InspectorPayload): string {
	const c = data.coverage;
	const lines: Array<string> = ["# yumcss inspector report", ""];

	lines.push("## Fold coverage", "");
	lines.push("| metric | value |", "| --- | --- |");
	lines.push(`| eliminated | ${c.eliminatedPct}% (${c.entryEliminatedPct}% entry-level) |`);
	lines.push(
		`| cx calls | ${c.totalCxCalls} (${c.fullFolded} full, ${c.partialFolded} partial, ${c.runtimeCalls} runtime) |`,
	);
	lines.push(`| tw calls folded | ${c.twFolded}/${c.totalTwCalls} |`);

	lines.push("", "## Per-file stats", "");
	lines.push(
		"| file | eliminated % | cx calls | token % | literal % | dynamic values | missing css |",
		"| --- | --- | --- | --- | --- | --- | --- |",
	);
	const coverageByFile = new Map(
		(data.analytics?.fileValueCoverage ?? []).map((coverage) => [coverage.file, coverage]),
	);
	for (const f of c.files) {
		const valueCoverage = coverageByFile.get(f.file);
		lines.push(
			`| ${f.file} | ${f.eliminatedPct}% | ${f.cxRuntime === 0 && f.cxCalls === 0 ? "—" : `${f.cxFoldedFull}/${f.cxFoldedPartial}/${f.cxRuntime}`} | ${valueCoverage?.tokenPct ?? "—"}% | ${valueCoverage?.literalPct ?? "—"}% | ${valueCoverage?.dynamicValues ?? "—"} | ${f.missingCssCount} |`,
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
 * Self-contained HTML report (wallace-style): the whole Inspector payload
 * rendered into one static file — shareable offline, no server needed.
 */
export function coverageToHtml(data: InspectorPayload, generatedAt: string): string {
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
<html><head><meta charset="utf-8"><title>yumcss report</title>
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
<h1>yumcss report <small style="color:#777">${htmlEsc(generatedAt)}</small></h1>
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
export const InspectorExport = {
	tokensToDtcg,
	tokensResolverToDtcg,
	themeVarsToCss,
	utilitiesToJson,
	coverageToJson,
	coverageToCsv,
	coverageToMarkdown,
	coverageToHtml,
	downloadFile,
} as const;
