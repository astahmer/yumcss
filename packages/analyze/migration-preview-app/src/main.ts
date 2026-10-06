import "./styles.css";

interface MigrationPreviewAdapterOption {
	id: string;
	label: string;
	role: string;
}

interface MigrationPreviewSnapshot {
	workspace: {
		root: string;
		files: readonly { document: { file: string; source: string } }[];
		conflicts?: readonly string[];
	};
	target?: { source?: string; target?: string };
	adapters?: { sources: MigrationPreviewAdapterOption[]; targets: MigrationPreviewAdapterOption[] };
	evaluation?: {
		execution?: {
			lane: string;
			verified: readonly string[];
			unavailable: readonly string[];
			note: string;
		};
		tree?: unknown;
		semantic?: unknown;
		themes?: unknown;
		diagnostics?: readonly { message: string; file?: string }[];
		artifacts?: {
			targetCode?: string;
			sourceCss?: string;
			targetCss?: string;
			files?: unknown[];
			sourceBytes?: number;
			targetBytes?: number;
		};
	};
	preview?: unknown;
}

const token = new URL(location.href).searchParams.get("token") || "";
const $ = (id: string): HTMLElement => {
	const element = document.getElementById(id);
	if (!element) throw new Error("missing Migration Preview element: " + id);
	return element;
};

let snapshot: MigrationPreviewSnapshot | null = null;
let selectedFile = "";

const status = (value: string, className = "muted") => {
	const element = $("status");
	element.textContent = value;
	element.className = className;
};

const call = async (path: string, body?: unknown): Promise<void> => {
	const response = await fetch(path + "?token=" + encodeURIComponent(token), {
		headers: { "content-type": "application/json", "x-yumcss-migration-preview-token": token },
		method: body === undefined ? "GET" : "POST",
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const value = (await response.json()) as MigrationPreviewSnapshot & { error?: string };
	if (!response.ok) throw new Error(value.error || "Migration Preview request failed");
	snapshot = value;
	render();
};

const createOption = (value: string, label: string): HTMLOptionElement => {
	const item = document.createElement("option");
	item.value = value;
	item.textContent = label;
	return item;
};

const renderAdapters = () => {
	if (!snapshot) return;
	const adapters = snapshot.adapters || { sources: [], targets: [] };
	const source = $("source") as HTMLSelectElement;
	const target = $("target") as HTMLSelectElement;
	source.replaceChildren(
		createOption("", "auto-detect source"),
		...adapters.sources.map(({ id, label }) => createOption(id, label)),
	);
	target.replaceChildren(...adapters.targets.map(({ id, label }) => createOption(id, label)));
	source.value = snapshot.target?.source || "";
	target.value = snapshot.target?.target || adapters.targets[0]?.id || "";
};

const render = () => {
	if (!snapshot) return;
	($("root") as HTMLInputElement).value = snapshot.workspace.root;
	const files = snapshot.workspace.files;
	if (!files.some(({ document }) => document.file === selectedFile))
		selectedFile = files[0]?.document.file || "";
	const fileSelect = $("file") as HTMLSelectElement;
	fileSelect.replaceChildren(
		...files.map(({ document }) =>
			createOption(document.file, document.file.replace(snapshot!.workspace.root + "/", "")),
		),
	);
	fileSelect.value = selectedFile;
	($("editor") as HTMLTextAreaElement).value =
		files.find(({ document }) => document.file === selectedFile)?.document.source || "";
	renderAdapters();
	const evaluation = snapshot.evaluation;
	const artifacts = evaluation?.artifacts || {};
	$("tree").textContent = JSON.stringify(evaluation?.tree || { roots: [] }, null, 2);
	$("output").textContent = artifacts.targetCode || "No target output yet.";
	$("semantic").textContent = JSON.stringify(evaluation?.semantic || { programs: [] }, null, 2);
	$("themes").textContent = JSON.stringify(evaluation?.themes || { scopes: [] }, null, 2);
	$("css").textContent = artifacts.targetCss || artifacts.sourceCss || "No CSS validation yet.";
	$("artifacts").textContent = JSON.stringify(
		{
			files: artifacts.files || [],
			sourceBytes: artifacts.sourceBytes,
			targetBytes: artifacts.targetBytes,
		},
		null,
		2,
	);
	$("execution").textContent = JSON.stringify(
		evaluation?.execution || { status: "unavailable", message: "No evaluation yet." },
		null,
		2,
	);
	$("preview").textContent = JSON.stringify(
		snapshot.preview || { status: "unavailable", message: "Static mode only." },
		null,
		2,
	);
	const diagnostics = evaluation?.diagnostics || [];
	$("diagnostics").textContent = diagnostics.length
		? diagnostics.map(({ message, file }) => (file ? file + ": " : "") + message).join("\n")
		: "No diagnostics.";
	if (snapshot.workspace.conflicts?.length) status("conflict: reopen to reload disk", "error");
	status("live", "ok");
};

$("file").addEventListener("change", async (event) => {
	selectedFile = (event.target as HTMLSelectElement).value;
	render();
	try {
		await call("/api/migration-preview/select", { file: selectedFile });
	} catch (error) {
		status(String(error), "error");
	}
});
$("open").addEventListener("click", async () => {
	try {
		await call("/api/migration-preview/open", { root: ($("root") as HTMLInputElement).value });
	} catch (error) {
		status(String(error), "error");
	}
});
$("apply").addEventListener("click", async () => {
	try {
		await call("/api/migration-preview/edit", {
			file: selectedFile,
			source: ($("editor") as HTMLTextAreaElement).value,
		});
	} catch (error) {
		status(String(error), "error");
	}
});
$("evaluate").addEventListener("click", async () => {
	try {
		await call("/api/migration-preview/target", {
			source: ($("source") as HTMLSelectElement).value || undefined,
			target: ($("target") as HTMLSelectElement).value,
		});
	} catch (error) {
		status(String(error), "error");
	}
});

const events = new EventSource("/api/migration-preview/events?token=" + encodeURIComponent(token));
events.onmessage = (event) => {
	snapshot = JSON.parse(event.data) as MigrationPreviewSnapshot;
	render();
};
events.onerror = () => status("connection lost; retrying…", "error");
call("/api/migration-preview/snapshot").catch((error) => status(String(error), "error"));
