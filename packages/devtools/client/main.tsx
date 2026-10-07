import { getDevToolsRpcClient } from "@vitejs/devtools-kit/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
	DEVTOOLS_RPC,
	type DevtoolsMigrationInput,
	type DevtoolsMigrationPreview,
} from "../src/rpc.ts";
import type { DevtoolsEvidenceSnapshot } from "../src/evidence/store.ts";
import { PANELS, PANEL_ID, type PanelId } from "./panels/index.tsx";
import logoMark from "../../../docs/yums/brand/logo-mark.svg";
import "./style.css";

type DevtoolsRpcClient = Awaited<ReturnType<typeof getDevToolsRpcClient>>;
type CatalogEntry = { readonly id: string; readonly officialApi?: string };

function LoadingState() {
	return (
		<div className="loading">
			Connecting to Vite <span className="loader" />
		</div>
	);
}

function ErrorState({
	message,
	onRetry,
}: {
	readonly message: string;
	readonly onRetry: () => void;
}) {
	return (
		<div className="error-state">
			<strong>DevTools connection failed</strong>
			<p>{message}</p>
			<button className="secondary-button" onClick={onRetry}>
				Retry
			</button>
		</div>
	);
}

function App() {
	const [activePanel, setActivePanel] = useState<PanelId>(PANEL_ID.Inspector);
	const [snapshot, setSnapshot] = useState<DevtoolsEvidenceSnapshot>();
	const [migration, setMigration] = useState<DevtoolsMigrationPreview>();
	const [migrationPending, setMigrationPending] = useState(false);
	const [migrationError, setMigrationError] = useState<string>();
	const [catalog, setCatalog] = useState<readonly CatalogEntry[]>([]);
	const [errorMessage, setErrorMessage] = useState<string>();
	const rpc = useRef<DevtoolsRpcClient | undefined>(undefined);

	const refresh = useCallback(async (): Promise<void> => {
		try {
			setErrorMessage(undefined);
			rpc.current ??= await getDevToolsRpcClient();
			const [nextSnapshot, nextCatalog] = await Promise.all([
				rpc.current.call(DEVTOOLS_RPC.GetSnapshot),
				rpc.current.call(DEVTOOLS_RPC.GetCatalog),
			]);
			setSnapshot(nextSnapshot);
			setCatalog(nextCatalog);
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : String(error));
		}
	}, []);

	const previewMigration = useCallback(async (form: FormData): Promise<void> => {
		if (rpc.current === undefined) return;
		const input: DevtoolsMigrationInput = {
			// Commas separate globs, except inside brace sets like `*.{ts,tsx}`.
			files: String(form.get("files") ?? "")
				.split(/,(?![^{]*\})/u)
				.map((file) => file.trim())
				.filter(Boolean),
			from: String(form.get("from") ?? ""),
			to: String(form.get("to") ?? ""),
			mode: String(form.get("mode") ?? "safe") as "safe" | "partial",
		};
		try {
			setMigrationError(undefined);
			setMigrationPending(true);
			setMigration(await rpc.current.call(DEVTOOLS_RPC.PreviewMigration, input));
			setSnapshot(await rpc.current.call(DEVTOOLS_RPC.GetSnapshot));
		} catch (error) {
			setMigrationError(error instanceof Error ? error.message : String(error));
		} finally {
			setMigrationPending(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
		const interval = window.setInterval(() => void refresh(), 3000);
		// The dock hides this iframe while the Inspect styles picker runs; catch up as soon as it is shown again.
		const onVisible = () => {
			if (document.visibilityState === "visible") void refresh();
		};
		document.addEventListener("visibilitychange", onVisible);
		window.addEventListener("focus", onVisible);
		return () => {
			window.clearInterval(interval);
			document.removeEventListener("visibilitychange", onVisible);
			window.removeEventListener("focus", onVisible);
		};
	}, [refresh]);

	// A fresh pick from the Inspect styles action should land on the Inspector, whatever panel was open.
	const lastSelectedAt = useRef(snapshot?.selected?.selectedAt);
	useEffect(() => {
		const selectedAt = snapshot?.selected?.selectedAt;
		if (selectedAt === undefined || selectedAt === lastSelectedAt.current) return;
		if (lastSelectedAt.current !== undefined || Date.now() - selectedAt < 10_000)
			setActivePanel(PANEL_ID.Inspector);
		lastSelectedAt.current = selectedAt;
	}, [snapshot?.selected?.selectedAt]);

	const panel = PANELS.find((entry) => entry.id === activePanel) ?? PANELS[0]!;

	return (
		<div className="app-shell">
			<header className="topbar">
				<div className="brand">
					<img className="brand-mark" src={logoMark} alt="" />
					<div>
						<strong>
							Yum<b>CSS</b>
						</strong>
						<small>DEVTOOLS</small>
					</div>
				</div>
				<div className="live-state">
					<span className="live-dot" /> Vite session <span className="slash">/</span>{" "}
					{snapshot?.root ?? "connecting"}
				</div>
				<button className="icon-button" onClick={() => void refresh()} title="Refresh evidence">
					↻
				</button>
			</header>
			<main className="workspace">
				<aside className="sidebar">
					<div className="side-label">Evidence surfaces</div>
					<nav>
						{PANELS.map((entry) => (
							<button
								className={entry.id === activePanel ? "tab-button active" : "tab-button"}
								key={entry.id}
								onClick={() => setActivePanel(entry.id)}
								type="button"
							>
								<span className="tab-icon">{entry.icon}</span>
								<span>
									<b>{entry.label}</b>
									<small>{entry.hint}</small>
								</span>
							</button>
						))}
					</nav>
					<div className="sidebar-foot">
						<span className="badge badge-good">
							{snapshot?.stylePrograms.length ?? 0} IR programs
						</span>
						<small>Evidence stays local to this Vite session.</small>
					</div>
				</aside>
				<section className="content">
					<div className="content-intro">
						<div>
							<span className="eyebrow">YUMCSS / LIVE WORKSPACE</span>
							<h1>{panel.label}</h1>
							<p>{panel.hint} · backed by shared compiler and migration evidence</p>
						</div>
						<button className="secondary-button" onClick={() => void refresh()}>
							Refresh
						</button>
					</div>
					<div className="content-grid">
						{errorMessage !== undefined ? (
							<ErrorState message={errorMessage} onRetry={() => void refresh()} />
						) : snapshot === undefined ? (
							<LoadingState />
						) : (
							panel.render({
								snapshot,
								context: {
									migration,
									migrationPending,
									migrationError,
									catalog,
									onPreviewMigration: (form) => void previewMigration(form),
								},
							})
						)}
					</div>
				</section>
			</main>
		</div>
	);
}

const app = document.querySelector<HTMLDivElement>("#app");
if (app !== null) createRoot(app).render(<App />);
