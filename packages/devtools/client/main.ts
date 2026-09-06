import { getDevToolsRpcClient } from "@vitejs/devtools-kit/client";
import {
	DEVTOOLS_RPC,
	type DevtoolsMigrationInput,
	type DevtoolsMigrationPreview,
} from "../src/rpc.ts";
import type { DevtoolsEvidenceSnapshot } from "../src/evidence/store.ts";
import { PANELS, PANEL_ID, type PanelId } from "./panels/index.ts";
import "./style.css";

let activePanel: PanelId = PANEL_ID.Inspector;
let snapshot: DevtoolsEvidenceSnapshot | undefined;
let migration: DevtoolsMigrationPreview | undefined;
let catalog: readonly { readonly id: string; readonly officialApi?: string }[] = [];
let errorMessage: string | undefined;
let rpc: Awaited<ReturnType<typeof getDevToolsRpcClient>> | undefined;

const app = typeof document === "undefined" ? null : document.querySelector<HTMLDivElement>("#app");

const escapeHtml = (value: unknown): string =>
	String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");

function render(): void {
	if (app === null) return;
	const panel = PANELS.find((entry) => entry.id === activePanel) ?? PANELS[0]!;
	const content =
		snapshot === undefined
			? `<div class="loading">Connecting to Vite <span class="loader"></span></div>`
			: errorMessage !== undefined
				? `<div class="error-state"><strong>DevTools connection failed</strong><p>${escapeHtml(errorMessage)}</p><button class="secondary-button" data-refresh>Retry</button></div>`
				: panel.render(snapshot, { migration, catalog });
	app.innerHTML = `<div class="app-shell"><header class="topbar"><div class="brand"><span class="brand-mark">✳</span><div><strong>PANDWIND</strong><small>DEVTOOLS</small></div></div><div class="live-state"><span class="live-dot"></span> Vite session <span class="slash">/</span> ${escapeHtml(snapshot?.root ?? "connecting")}</div><button class="icon-button" data-refresh title="Refresh evidence">↻</button></header><main class="workspace"><aside class="sidebar"><div class="side-label">Evidence surfaces</div><nav>${PANELS.map((entry) => `<button class="tab-button ${activePanel === entry.id ? "active" : ""}" data-tab="${entry.id}"><span class="tab-icon">${entry.icon}</span><span><b>${entry.label}</b><small>${entry.hint}</small></span></button>`).join("")}</nav><div class="sidebar-foot"><span class="badge badge-good">${snapshot?.stylePrograms.length ?? 0} IR programs</span><small>Evidence stays local to this Vite session.</small></div></aside><section class="content"><div class="content-intro"><div><span class="eyebrow">PANDWIND / LIVE WORKSPACE</span><h1>${panel.label}</h1><p>${panel.hint} · backed by shared compiler and migration evidence</p></div><button class="secondary-button" data-refresh>Refresh</button></div><div class="content-grid">${content}</div></section></main></div>`;
	for (const button of app.querySelectorAll<HTMLButtonElement>("[data-tab]"))
		button.onclick = () => {
			const next = button.dataset.tab;
			if (next !== undefined && PANELS.some((entry) => entry.id === next)) {
				activePanel = next as PanelId;
				render();
			}
		};
	for (const button of app.querySelectorAll<HTMLButtonElement>("[data-refresh]"))
		button.onclick = () => void refresh();
	const form = app.querySelector<HTMLFormElement>("#migration-form");
	if (form !== null)
		form.onsubmit = (event) => {
			event.preventDefault();
			void previewMigration(new FormData(form));
		};
}

async function refresh(): Promise<void> {
	try {
		errorMessage = undefined;
		rpc ??= await getDevToolsRpcClient();
		[snapshot, catalog] = await Promise.all([
			rpc.call(DEVTOOLS_RPC.GetSnapshot),
			rpc.call(DEVTOOLS_RPC.GetCatalog),
		]);
		render();
	} catch (error) {
		errorMessage = error instanceof Error ? error.message : String(error);
		render();
	}
}

async function previewMigration(form: FormData): Promise<void> {
	if (rpc === undefined) return;
	const input: DevtoolsMigrationInput = {
		files: String(form.get("files") ?? "")
			.split(",")
			.map((file) => file.trim())
			.filter(Boolean),
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

if (app !== null) {
	render();
	void refresh();
	window.setInterval(() => void refresh(), 3000);
}
