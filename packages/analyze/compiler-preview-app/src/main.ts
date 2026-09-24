import { z } from "zod";
import {
	File as PierreFile,
	FileDiff,
	type FileDiffOptions,
	type FileOptions,
} from "@pierre/diffs";
import { createCompilerDiff } from "./compiler-diff.ts";
import { vscodeFileUri } from "./vscode-link.ts";
import "./styles.css";

const runtimeInfoSchema = z.object({
	root: z.string(),
	viteVersion: z.string(),
	plugins: z.array(z.string()),
	pandwindPlugins: z.array(z.string()),
});

const fileSchema = z.object({ path: z.string(), bytes: z.number() });
const sourceSchema = z.object({ file: z.string(), source: z.string(), sourceBytes: z.number() });
const transformSchema = z.object({
	file: z.string(),
	source: z.string(),
	code: z.string(),
	sourceBytes: z.number(),
	outputBytes: z.number(),
	durationMs: z.number(),
});
const errorSchema = z.object({ error: z.string() });

type PreviewFile = z.infer<typeof fileSchema>;
type TransformResult = z.infer<typeof transformSchema>;
type PreviewMode = "diff" | "side-by-side";
type DiffLayout = "unified" | "split";

type ActiveRenderer =
	| { kind: "diff"; renderer: FileDiff }
	| { kind: "side-by-side"; source: PierreFile; output: PierreFile | null }
	| null;

const token = new URL(location.href).searchParams.get("token") ?? "";
const requiredElement = (id: string): HTMLElement => {
	const element = document.getElementById(id);
	if (element === null) throw new Error(`Compiler Preview UI is missing #${id}`);
	return element;
};

const requiredInput = (id: string): HTMLInputElement => {
	const element = document.getElementById(id);
	if (!(element instanceof HTMLInputElement))
		throw new Error(`Compiler Preview UI is missing input #${id}`);
	return element;
};

const requiredAnchor = (id: string): HTMLAnchorElement => {
	const element = document.getElementById(id);
	if (!(element instanceof HTMLAnchorElement))
		throw new Error(`Compiler Preview UI is missing link #${id}`);
	return element;
};

const ui = {
	projectRoot: requiredElement("project-root"),
	compilerStatus: requiredElement("compiler-status"),
	refresh: requiredElement("refresh"),
	fileCount: requiredElement("file-count"),
	fileFilter: requiredInput("file-filter"),
	fileList: requiredElement("file-list"),
	fileName: requiredElement("file-name"),
	fileDetail: requiredElement("file-detail"),
	changeBadge: requiredElement("change-badge"),
	compileTime: requiredElement("compile-time"),
	openSourceInEditor: requiredAnchor("open-source-in-editor"),
	errorPanel: requiredElement("error-panel"),
	viewDiff: requiredElement("view-diff"),
	viewSideBySide: requiredElement("view-side-by-side"),
	diffLayoutControls: requiredElement("diff-layout-controls"),
	layoutUnified: requiredElement("layout-unified"),
	layoutSplit: requiredElement("layout-split"),
	diffPane: requiredElement("diff-pane"),
	diffSummary: requiredElement("diff-summary"),
	diffCode: requiredElement("diff-code"),
	codePanes: requiredElement("code-panes"),
	sourceLines: requiredElement("source-lines"),
	outputLines: requiredElement("output-lines"),
	sourceCode: requiredElement("source-code"),
	compiledCode: requiredElement("compiled-code"),
	pluginSummary: requiredElement("plugin-summary"),
};

const request = async <Schema extends z.ZodType>(
	path: string,
	schema: Schema,
): Promise<z.infer<Schema>> => {
	const response = await fetch(path, {
		headers: { "x-pandwind-compiler-preview-token": token },
	});
	const value: unknown = await response.json();
	if (!response.ok) {
		const parsedError = errorSchema.safeParse(value);
		throw new Error(
			parsedError.success ? parsedError.data.error : `Request failed (${response.status})`,
		);
	}
	return schema.parse(value);
};

const setCompilerStatus = (message: string, state: "active" | "warning" | "error" | "idle") => {
	ui.compilerStatus.replaceChildren();
	const dot = document.createElement("span");
	dot.className = "status-dot";
	dot.setAttribute("aria-hidden", "true");
	const label = document.createElement("span");
	label.textContent = message;
	ui.compilerStatus.append(dot, label);
	ui.compilerStatus.className = `compiler-status is-${state}`;
};

const setReadyStatus = (): void => {
	setCompilerStatus(
		pandwindPluginActive ? "Pandwind active" : "Vite ready · no Pandwind plugin",
		pandwindPluginActive ? "active" : "warning",
	);
};

const setError = (message: string): void => {
	ui.errorPanel.textContent = message;
	ui.errorPanel.hidden = message === "";
};

const formatBytes = (bytes: number): string => {
	if (bytes < 1_000) return `${bytes} B`;
	if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} kB`;
	return `${(bytes / 1_000_000).toFixed(1)} MB`;
};

const lineCount = (code: string): number => code.split("\n").length;

const setPreviewMessage = (element: HTMLElement, message: string): void => {
	element.classList.add("is-placeholder");
	element.textContent = message;
};

const rendererCSS = `
:host {
	background: var(--code);
	color: var(--ink);
	font-family: var(--mono);
}

pre {
	font-family: var(--mono);
	font-size: 11px;
	line-height: 1.72;
}
`;

const fileOptions = {
	theme: "github-dark",
	themeType: "dark",
	overflow: "scroll",
	disableFileHeader: true,
	unsafeCSS: rendererCSS,
} satisfies FileOptions<undefined, undefined>;

const diffOptions = (diffStyle: DiffLayout): FileDiffOptions<undefined, undefined> => ({
	...fileOptions,
	diffStyle,
	diffIndicators: "bars",
	hunkSeparators: "line-info-basic",
	lineDiffType: "word",
});

let previewFiles: readonly PreviewFile[] = [];
let selectedFile = "";
let workspaceRoot = "";
let activeCompile = 0;
let pandwindPluginActive = false;
let previewMode: PreviewMode = "diff";
let diffLayout: DiffLayout = "split";
let activeRenderer: ActiveRenderer = null;
let pendingSource: { file: string; source: string } | null = null;
let latestResult: TransformResult | null = null;
let previewMessages = {
	diff: "Choose a source file from the workspace.",
	source: "Choose a source file from the workspace.",
	output: "Transformed output appears here.",
};
let pendingOutputMessage = "Transformed output appears here.";

const clearActiveRenderer = (): void => {
	if (activeRenderer?.kind === "diff") activeRenderer.renderer.cleanUp();
	if (activeRenderer?.kind === "side-by-side") {
		activeRenderer.source.cleanUp();
		activeRenderer.output?.cleanUp();
	}
	activeRenderer = null;
	ui.diffCode.replaceChildren();
	ui.sourceCode.replaceChildren();
	ui.compiledCode.replaceChildren();
};

const updatePreviewControls = (): void => {
	const isDiff = previewMode === "diff";
	ui.diffPane.hidden = !isDiff;
	ui.codePanes.hidden = isDiff;
	ui.diffLayoutControls.hidden = !isDiff;
	ui.viewDiff.setAttribute("aria-pressed", String(isDiff));
	ui.viewSideBySide.setAttribute("aria-pressed", String(!isDiff));
	ui.layoutUnified.setAttribute("aria-pressed", String(diffLayout === "unified"));
	ui.layoutSplit.setAttribute("aria-pressed", String(diffLayout === "split"));
};

const renderDiff = (result: TransformResult): void => {
	const fileDiff = createCompilerDiff(result);
	const additions = fileDiff.hunks.reduce((total, hunk) => total + hunk.additionCount, 0);
	const deletions = fileDiff.hunks.reduce((total, hunk) => total + hunk.deletionCount, 0);
	ui.diffSummary.textContent =
		fileDiff.hunks.length === 0 ? "No changes" : `+${additions} / −${deletions} lines`;
	if (fileDiff.hunks.length === 0) {
		setPreviewMessage(ui.diffCode, "The compiler left this module unchanged.");
		return;
	}
	const renderer = new FileDiff(diffOptions(diffLayout));
	ui.diffCode.classList.remove("is-placeholder");
	renderer.render({ fileDiff, containerWrapper: ui.diffCode });
	activeRenderer = { kind: "diff", renderer };
};

const renderSideBySide = (result: TransformResult): void => {
	const source = new PierreFile(fileOptions);
	const output = new PierreFile(fileOptions);
	ui.sourceCode.classList.remove("is-placeholder");
	ui.compiledCode.classList.remove("is-placeholder");
	source.render({
		file: { name: result.file, contents: result.source },
		containerWrapper: ui.sourceCode,
	});
	output.render({
		file: { name: result.file, contents: result.code },
		containerWrapper: ui.compiledCode,
	});
	activeRenderer = { kind: "side-by-side", source, output };
};

const renderSourceOnly = (
	source: { file: string; source: string },
	outputMessage: string,
): void => {
	const renderer = new PierreFile(fileOptions);
	ui.sourceCode.classList.remove("is-placeholder");
	renderer.render({
		file: { name: source.file, contents: source.source },
		containerWrapper: ui.sourceCode,
	});
	setPreviewMessage(ui.compiledCode, outputMessage);
	ui.sourceLines.textContent = `${lineCount(source.source)} lines`;
	ui.outputLines.textContent = "—";
	activeRenderer = { kind: "side-by-side", source: renderer, output: null };
};

const renderPreview = (): void => {
	clearActiveRenderer();
	updatePreviewControls();
	if (latestResult !== null) {
		if (previewMode === "diff") renderDiff(latestResult);
		else renderSideBySide(latestResult);
		return;
	}
	if (previewMode === "side-by-side" && pendingSource !== null) {
		renderSourceOnly(pendingSource, pendingOutputMessage);
		return;
	}
	ui.diffSummary.textContent = "—";
	setPreviewMessage(ui.diffCode, previewMessages.diff);
	setPreviewMessage(ui.sourceCode, previewMessages.source);
	setPreviewMessage(ui.compiledCode, previewMessages.output);
};

const setPreviewMode = (mode: PreviewMode): void => {
	if (previewMode === mode) return;
	previewMode = mode;
	renderPreview();
};

const setDiffLayout = (layout: DiffLayout): void => {
	if (diffLayout === layout) return;
	diffLayout = layout;
	renderPreview();
};

const renderFileList = (): void => {
	const filter = ui.fileFilter.value.trim().toLowerCase();
	const filtered = previewFiles.filter((file) => file.path.toLowerCase().includes(filter));
	ui.fileList.replaceChildren();
	ui.fileCount.textContent = String(filtered.length);
	if (filtered.length === 0) {
		const empty = document.createElement("p");
		empty.className = "empty-files";
		empty.textContent =
			previewFiles.length === 0
				? "No supported source files found."
				: "No files match this filter.";
		ui.fileList.append(empty);
		return;
	}
	for (const file of filtered) {
		const button = document.createElement("button");
		button.className = "file-row";
		button.type = "button";
		button.setAttribute("role", "option");
		button.setAttribute("aria-selected", String(file.path === selectedFile));
		button.title = `${file.path} · ${formatBytes(file.bytes)}`;
		const extension = file.path.split(".").at(-1)?.slice(0, 3).toUpperCase() ?? "SRC";
		const glyph = document.createElement("span");
		glyph.className = "file-glyph";
		glyph.setAttribute("aria-hidden", "true");
		glyph.textContent = extension;
		const path = document.createElement("span");
		path.className = "file-path";
		path.textContent = file.path;
		button.append(glyph, path);
		button.addEventListener("click", () => void compileFile(file.path));
		ui.fileList.append(button);
	}
};

const renderResult = (result: TransformResult): void => {
	ui.fileName.textContent = result.file;
	ui.fileDetail.textContent = `${formatBytes(result.sourceBytes)} source · ${formatBytes(result.outputBytes)} output`;
	ui.sourceLines.textContent = `${lineCount(result.source)} lines`;
	ui.outputLines.textContent = `${lineCount(result.code)} lines`;
	ui.compileTime.textContent = `${result.durationMs.toFixed(1)} ms`;
	const changed = result.source !== result.code;
	ui.changeBadge.textContent = changed ? "Transformed" : "Unchanged";
	ui.changeBadge.className = `change-badge is-${changed ? "changed" : "unchanged"}`;
	pendingSource = { file: result.file, source: result.source };
	latestResult = result;
	renderPreview();
	setError("");
	setReadyStatus();
};

const compileFile = async (file: string): Promise<void> => {
	selectedFile = file;
	ui.openSourceInEditor.href = vscodeFileUri(workspaceRoot, file);
	ui.openSourceInEditor.setAttribute("aria-label", `Open ${file} in VS Code`);
	ui.openSourceInEditor.title = `Open ${file} in Visual Studio Code`;
	ui.openSourceInEditor.hidden = workspaceRoot === "";
	const requestId = ++activeCompile;
	let loadedSource: { file: string; source: string } | null = null;
	pendingSource = null;
	latestResult = null;
	previewMessages = {
		diff: "Compiling module…",
		source: "Reading source…",
		output: "Compiling module…",
	};
	pendingOutputMessage = "Compiling module…";
	ui.refresh.setAttribute("disabled", "true");
	ui.changeBadge.textContent = "Compiling";
	ui.changeBadge.className = "change-badge";
	ui.compileTime.textContent = "…";
	ui.fileName.textContent = file;
	ui.fileDetail.textContent = "Running Vite plugin transforms…";
	ui.sourceLines.textContent = "…";
	ui.outputLines.textContent = "…";
	setError("");
	renderPreview();
	renderFileList();
	try {
		const source = await request(
			`/api/compiler-preview/source?file=${encodeURIComponent(file)}`,
			sourceSchema,
		);
		if (requestId !== activeCompile) return;
		loadedSource = { file: source.file, source: source.source };
		pendingSource = loadedSource;
		pendingOutputMessage = "Running Vite plugin transforms…";
		ui.sourceLines.textContent = `${lineCount(source.source)} lines`;
		if (previewMode === "side-by-side") renderPreview();
		const result = await request(
			`/api/compiler-preview/transform?file=${encodeURIComponent(file)}`,
			transformSchema,
		);
		if (requestId === activeCompile) renderResult(result);
	} catch (error) {
		if (requestId !== activeCompile) return;
		if (loadedSource === null) {
			previewMessages = {
				diff: "Source could not be read.",
				source: "Source could not be read.",
				output: "No transformed output.",
			};
			ui.sourceLines.textContent = "—";
			ui.outputLines.textContent = "—";
			renderPreview();
		} else {
			previewMode = "side-by-side";
			pendingOutputMessage = "No transformed output.";
			previewMessages = {
				diff: "The transform failed. Source remains available beside the empty output.",
				source: "",
				output: "No transformed output.",
			};
			renderPreview();
		}
		ui.compileTime.textContent = "failed";
		ui.changeBadge.textContent = "Compile error";
		ui.changeBadge.className = "change-badge";
		setError(error instanceof Error ? error.message : String(error));
		setCompilerStatus("Transform failed", "error");
	} finally {
		if (requestId === activeCompile) ui.refresh.removeAttribute("disabled");
	}
};

const start = async (): Promise<void> => {
	if (token === "") {
		setCompilerStatus("Missing access token", "error");
		setError("Open this page from the URL printed by pandwind-compiler-preview.");
		return;
	}
	try {
		const info = await request("/api/compiler-preview/info", runtimeInfoSchema);
		workspaceRoot = info.root;
		ui.projectRoot.textContent = info.root;
		pandwindPluginActive = info.pandwindPlugins.length > 0;
		setReadyStatus();
		ui.pluginSummary.textContent =
			info.plugins.length === 0
				? `Vite ${info.viteVersion} · no configured plugins`
				: `Vite ${info.viteVersion} · ${info.plugins.join(" · ")}`;
		previewFiles = await request("/api/compiler-preview/files", z.array(fileSchema));
		renderFileList();
		ui.refresh.removeAttribute("disabled");
		if (previewFiles.length > 0) await compileFile(previewFiles[0].path);
		else setCompilerStatus("No source files", "warning");
	} catch (error) {
		setCompilerStatus("Preview unavailable", "error");
		setError(error instanceof Error ? error.message : String(error));
	}
};

ui.fileFilter.addEventListener("input", renderFileList);
ui.viewDiff.addEventListener("click", () => setPreviewMode("diff"));
ui.viewSideBySide.addEventListener("click", () => setPreviewMode("side-by-side"));
ui.layoutUnified.addEventListener("click", () => setDiffLayout("unified"));
ui.layoutSplit.addEventListener("click", () => setDiffLayout("split"));
ui.refresh.addEventListener("click", () => {
	if (selectedFile !== "") void compileFile(selectedFile);
});

void start();
