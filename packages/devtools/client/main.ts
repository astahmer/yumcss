import { getDevToolsRpcClient } from "@vitejs/devtools-kit/client";
import { DEVTOOLS_RPC, type DevtoolsMigrationInput, type DevtoolsMigrationPreview } from "../src/rpc.ts";
import type { DevtoolsEvidenceSnapshot } from "../src/evidence/store.ts";
import "./style.css";

const TAB = {
	Inspector: "inspector",
	Graph: "graph",
	Tokens: "tokens",
	Migration: "migration",
	Diagnostics: "diagnostics",
	Performance: "performance",
} as const;
type Tab = (typeof TAB)[keyof typeof TAB];

const TABS: readonly { readonly id: Tab; readonly label: string; readonly hint: string }[] = [
	{ id: TAB.Inspector, label: "Inspector", hint: "selected element" },
	{ id: TAB.Graph, label: "Style graph", hint: "source → style" },
	{ id: TAB.Tokens, label: "Tokens", hint: "theme evidence" },
	{ id: TAB.Migration, label: "Migration", hint: "preview only" },
	{ id: TAB.Diagnostics, label: "Diagnostics", hint: "residuals & scans" },
	{ id: TAB.Performance, label: "Performance", hint: "dev timings" },
];

let activeTab: Tab = TAB.Inspector;
let snapshot: DevtoolsEvidenceSnapshot | undefined;
let migration: DevtoolsMigrationPreview | undefined;
let errorMessage: string | undefined;
let rpc: Awaited<ReturnType<typeof getDevToolsRpcClient>> | undefined;

const app = document.querySelector<HTMLDivElement>("#app");
if (app === null) throw new Error("Pandwind DevTools root is missing");

const escapeHtml = (value: unknown): string =>
	String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");

const shortPath = (value: string): string => value.replaceAll("\\", "/").split("/").slice(-3).join("/");

function badge(label: string, tone: "good" | "warn" | "quiet" = "quiet"): string {
	return `<span class="badge badge-${tone}">${escapeHtml(label)}</span>`;
}

function emptyState(title: string, detail: string): string {
	return `<div class="empty-state"><span class="empty-mark">∅</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div>`;
}

function card(title: string, eyebrow: string, body: string, extra = ""): string {
	return `<section class="card ${extra}"><div class="card-head"><div><span class="eyebrow">${escapeHtml(eyebrow)}</span><h2>${escapeHtml(title)}</h2></div></div>${body}</section>`;
}

function renderInspector(data: DevtoolsEvidenceSnapshot): string {
	const selected = data.selected;
	const selection = selected
		? `<div class="selection-grid">
			<div><span class="field-label">Element</span><code>${escapeHtml(selected.tagName ?? "unknown")}</code></div>
			<div><span class="field-label">className</span><code>${escapeHtml(selected.className ?? "—")}</code></div>
			<div><span class="field-label">Files</span><strong>${selected.matchedFiles.length}</strong></div>
			<div><span class="field-label">Programs</span><strong>${selected.matchedPrograms.length}</strong></div>
		</div>
		<div class="chip-row">${Object.entries(selected.attributes)
			.map(([key, value]) => `<span class="chip"><b>${escapeHtml(key)}</b> ${escapeHtml(value)}</span>`)
			.join("")}</div>`
		: emptyState("Nothing selected", "Open the Inspect styles action in Vite DevTools, then click an element in the running app.");
	const recent = data.stylePrograms.slice(0, 6).map((program) => {
		const declarations = program.program.rules.reduce((count, rule) => count + rule.declarations.length, 0);
		return `<div class="list-row"><div><strong>${escapeHtml(program.label ?? program.id)}</strong><small>${escapeHtml(program.file ?? "generated evidence")}</small></div>${badge(`${declarations} declarations`, "good")}</div>`;
	}).join("");
	return `${card("Element inspector", "LIVE SELECTION", selection, "hero-card")}${card("Recent style programs", "STYLEPROGRAM IR", recent || emptyState("No programs yet", "Run a migration preview or use a Pandwind compiler integration to populate style evidence."))}`;
}

function renderGraph(data: DevtoolsEvidenceSnapshot): string {
	const rows = data.stylePrograms.map((program) => {
		const declarations = program.program.rules.reduce((count, rule) => count + rule.declarations.length, 0);
		return `<div class="graph-row"><div class="node node-file">${escapeHtml(shortPath(program.file ?? "runtime"))}</div><span class="edge">→</span><div class="node node-program"><b>${escapeHtml(program.label ?? program.id)}</b><small>${program.program.rules.length} rules · ${declarations} declarations</small></div></div>`;
	}).join("");
	const rawPrograms = data.stylePrograms.map((program) => `<details class="raw-block"><summary>${escapeHtml(program.id)} <span>${program.program.rules.length} rules</span></summary><pre>${escapeHtml(JSON.stringify(program.program, null, 2))}</pre></details>`).join("");
	return `${card("Style graph", "PROVENANCE", rows || emptyState("No graph edges", "Style programs appear here after a compiler or migration produces inspectable IR."), "wide-card")}${card("IR details", "RAW FALLBACK", rawPrograms || emptyState("No IR available", "The raw representation stays available when a program is present."), "wide-card")}`;
}

function renderTokens(data: DevtoolsEvidenceSnapshot): string {
	const rows = data.tokens.map((token) => `<tr><td><code>${escapeHtml(token.name)}</code></td><td>${escapeHtml(token.value)}</td><td>${badge(token.kind, "good")}</td><td>${escapeHtml(token.theme ?? "default")}</td><td>${token.files.length}</td></tr>`).join("");
	const body = rows ? `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Resolved value</th><th>Kind</th><th>Theme</th><th>Files</th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyState("No generated token catalog", "Generate pandwind.interop.json to make resolved theme variables visible here.");
	return card("Tokens & themes", "GENERATED ARTIFACTS", body, "wide-card");
}

function renderMigration(data: DevtoolsEvidenceSnapshot): string {
	const last = migration ?? data.migrations[0];
	const result = last
		? `<div class="migration-result"><div class="metric-strip"><div><span>Files</span><strong>${last.files.length}</strong></div><div><span>Changed</span><strong>${last.files.filter((file) => file.changed).length}</strong></div><div><span>Residuals</span><strong class="${last.files.some((file) => file.residuals.length > 0) ? "metric-warn" : ""}">${last.files.reduce((count, file) => count + file.residuals.length, 0)}</strong></div></div>${last.files.map((file) => `<details class="diff-block" open><summary>${escapeHtml(file.file)} ${file.changed ? badge("changed", "good") : badge("unchanged")}</summary><pre>${escapeHtml(file.diff || "No source changes")}</pre></details>`).join("")}</div>`
		: emptyState("No preview yet", "Preview a registered source → target route. The panel never writes files.");
	return `${card("Migration lab", "READ-ONLY PREVIEW", `<form id="migration-form" class="migration-form"><label>Files or globs<input name="files" value="src/**/*.{ts,tsx}" /></label><label>From<input name="from" value="styled-components" /></label><label>To<input name="to" value="pandwind" /></label><label>Mode<select name="mode"><option value="safe">safe</option><option value="partial">partial</option></select></label><button type="submit" class="primary-button">Preview migration <span>↗</span></button></form>${result}`, "wide-card")}`;
}

function renderDiagnostics(data: DevtoolsEvidenceSnapshot): string {
	const rows = data.diagnostics.map((diagnostic) => `<div class="diagnostic-row"><span class="severity severity-${diagnostic.severity}"></span><div><strong>${escapeHtml(diagnostic.message)}</strong><small>${escapeHtml(diagnostic.file ?? "project")} · ${escapeHtml(diagnostic.source)}</small></div>${badge(diagnostic.severity, diagnostic.severity === "error" ? "warn" : "quiet")}</div>`).join("");
	const residuals = data.migrations.flatMap((migrationRecord) => migrationRecord.residuals > 0 ? [`<div class="diagnostic-row"><span class="severity severity-warn"></span><div><strong>${escapeHtml(migrationRecord.from)} → ${escapeHtml(migrationRecord.to)}</strong><small>${escapeHtml(migrationRecord.files.join(", "))}</small></div>${badge(`${migrationRecord.residuals} residuals`, "warn")}</div>`] : []).join("");
	return `${card("Diagnostics & residuals", "ACTIONABLE EVIDENCE", rows + residuals || emptyState("No diagnostics", "The current development session has no scanner or migration diagnostics."), "wide-card")}`;
}

function renderPerformance(data: DevtoolsEvidenceSnapshot): string {
	const totalBytes = data.transforms.reduce((sum, item) => sum + item.bytes, 0);
	const totalMs = data.transforms.reduce((sum, item) => sum + item.durationMs, 0);
	const rows = data.transforms.map((item) => `<tr><td><code>${escapeHtml(shortPath(item.file))}</code></td><td>${item.bytes.toLocaleString()} B</td><td>${item.durationMs.toFixed(2)} ms</td><td>${item.transformCount}</td></tr>`).join("");
	return `${card("Build & runtime performance", "DEV SERVER EVIDENCE", `<div class="metric-strip"><div><span>Modules</span><strong>${data.transforms.length}</strong></div><div><span>Source bytes</span><strong>${totalBytes.toLocaleString()}</strong></div><div><span>Scan time</span><strong>${totalMs.toFixed(1)} ms</strong></div><div><span>HMR events</span><strong>${data.runtime.filter((event) => event.event === "hmr-update").length}</strong></div></div>${rows ? `<div class="table-wrap"><table><thead><tr><th>Module</th><th>Size</th><th>Transform</th><th>Runs</th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyState("No module timings", "Edit a source file or start the Vite app to collect timings.")}`, "wide-card")}`;
}

function renderContent(): string {
	if (snapshot === undefined) return `<div class="loading">Connecting to Vite <span class="loader"></span></div>`;
	if (errorMessage !== undefined) return `<div class="error-state"><strong>DevTools connection failed</strong><p>${escapeHtml(errorMessage)}</p><button class="secondary-button" data-refresh>Retry</button></div>`;
	switch (activeTab) {
		case TAB.Inspector: return renderInspector(snapshot);
		case TAB.Graph: return renderGraph(snapshot);
		case TAB.Tokens: return renderTokens(snapshot);
		case TAB.Migration: return renderMigration(snapshot);
		case TAB.Diagnostics: return renderDiagnostics(snapshot);
		case TAB.Performance: return renderPerformance(snapshot);
	}
}

function render(): void {
	app.innerHTML = `<div class="app-shell"><header class="topbar"><div class="brand"><span class="brand-mark">✳</span><div><strong>PANDWIND</strong><small>DEVTOOLS</small></div></div><div class="live-state"><span class="live-dot"></span> Vite session <span class="slash">/</span> ${escapeHtml(snapshot?.root ?? "connecting")}</div><button class="icon-button" data-refresh title="Refresh evidence">↻</button></header><main class="workspace"><aside class="sidebar"><div class="side-label">Evidence surfaces</div><nav>${TABS.map((tab) => `<button class="tab-button ${activeTab === tab.id ? "active" : ""}" data-tab="${tab.id}"><span class="tab-icon">${tab.id === TAB.Inspector ? "⌁" : tab.id === TAB.Graph ? "⌘" : tab.id === TAB.Tokens ? "◇" : tab.id === TAB.Migration ? "↗" : tab.id === TAB.Diagnostics ? "!" : "◷"}</span><span><b>${tab.label}</b><small>${tab.hint}</small></span></button>`).join("")}</nav><div class="sidebar-foot">${badge(`${snapshot?.stylePrograms.length ?? 0} IR programs`, "good")}<small>Evidence stays local to this Vite session.</small></div></aside><section class="content"><div class="content-intro"><div><span class="eyebrow">PANDWIND / LIVE WORKSPACE</span><h1>${TABS.find((tab) => tab.id === activeTab)?.label}</h1><p>${TABS.find((tab) => tab.id === activeTab)?.hint} · backed by the existing compiler and analyzer services</p></div><button class="secondary-button" data-refresh>Refresh</button></div><div class="content-grid">${renderContent()}</div></section></main></div>`;
	for (const button of app.querySelectorAll<HTMLButtonElement>("[data-tab]")) button.onclick = () => {
		const next = button.dataset.tab;
		if (next !== undefined && Object.values(TAB).includes(next as Tab)) {
			activeTab = next as Tab;
			render();
		}
	};
	for (const button of app.querySelectorAll<HTMLButtonElement>("[data-refresh]")) button.onclick = () => void refresh();
	const form = app.querySelector<HTMLFormElement>("#migration-form");
	if (form !== null) form.onsubmit = (event) => {
		event.preventDefault();
		void previewMigration(new FormData(form));
	};
}

async function refresh(): Promise<void> {
	try {
		errorMessage = undefined;
		rpc ??= await getDevToolsRpcClient();
		snapshot = await rpc.call(DEVTOOLS_RPC.GetSnapshot);
		render();
	} catch (error) {
		errorMessage = error instanceof Error ? error.message : String(error);
		render();
	}
}

async function previewMigration(form: FormData): Promise<void> {
	if (rpc === undefined) return;
	const files = String(form.get("files") ?? "").split(",").map((file) => file.trim()).filter(Boolean);
	const input: DevtoolsMigrationInput = {
		files,
		from: String(form.get("from") ?? ""),
		to: String(form.get("to") ?? ""),
		mode: String(form.get("mode") ?? "safe") as "safe" | "partial",
	};
	try {
		migration = await rpc.call(DEVTOOLS_RPC.PreviewMigration, input);
		snapshot = await rpc.call(DEVTOOLS_RPC.GetSnapshot);
		render();
	} catch (error) {
		errorMessage = error instanceof Error ? error.message : String(error);
		render();
	}
}

render();
void refresh();
window.setInterval(() => void refresh(), 3000);
