import { z } from "zod";
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

type RuntimeInfo = z.infer<typeof runtimeInfoSchema>;
type PreviewFile = z.infer<typeof fileSchema>;
type TransformResult = z.infer<typeof transformSchema>;

const token = new URL(location.href).searchParams.get("token") ?? "";
const requiredElement = (id: string): HTMLElement => {
	const element = document.getElementById(id);
	if (element === null) throw new Error(`Compiler Preview UI is missing #${id}`);
	return element;
};

const requiredInput = (id: string): HTMLInputElement => {
	const element = document.getElementById(id);
	if (!(element instanceof HTMLInputElement)) throw new Error(`Compiler Preview UI is missing input #${id}`);
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
	errorPanel: requiredElement("error-panel"),
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
		throw new Error(parsedError.success ? parsedError.data.error : `Request failed (${response.status})`);
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

let previewFiles: readonly PreviewFile[] = [];
let selectedFile = "";
let activeCompile = 0;

const renderFileList = (): void => {
	const filter = ui.fileFilter.value.trim().toLowerCase();
	const filtered = previewFiles.filter((file) => file.path.toLowerCase().includes(filter));
	ui.fileList.replaceChildren();
	ui.fileCount.textContent = String(filtered.length);
	if (filtered.length === 0) {
		const empty = document.createElement("p");
		empty.className = "empty-files";
		empty.textContent = previewFiles.length === 0 ? "No supported source files found." : "No files match this filter.";
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
	ui.sourceCode.textContent = result.source;
	ui.compiledCode.textContent = result.code;
	ui.sourceLines.textContent = `${lineCount(result.source)} lines`;
	ui.outputLines.textContent = `${lineCount(result.code)} lines`;
	ui.compileTime.textContent = `${result.durationMs.toFixed(1)} ms`;
	const changed = result.source !== result.code;
	ui.changeBadge.textContent = changed ? "Transformed" : "Unchanged";
	ui.changeBadge.className = `change-badge is-${changed ? "changed" : "unchanged"}`;
	setError("");
	setCompilerStatus("Vite ready", "active");
};

const compileFile = async (file: string): Promise<void> => {
	selectedFile = file;
	const requestId = ++activeCompile;
	let sourceLoaded = false;
	ui.refresh.setAttribute("disabled", "true");
	ui.changeBadge.textContent = "Compiling";
	ui.changeBadge.className = "change-badge";
	ui.compileTime.textContent = "…";
	ui.fileName.textContent = file;
	ui.fileDetail.textContent = "Running Vite plugin transforms…";
	ui.sourceCode.textContent = "Reading source…";
	ui.sourceLines.textContent = "…";
	ui.compiledCode.textContent = "Compiling module…";
	setError("");
	renderFileList();
	try {
		const source = await request(
			`/api/compiler-preview/source?file=${encodeURIComponent(file)}`,
			sourceSchema,
		);
		if (requestId !== activeCompile) return;
		ui.sourceCode.textContent = source.source;
		ui.sourceLines.textContent = `${lineCount(source.source)} lines`;
		sourceLoaded = true;
		const result = await request(
			`/api/compiler-preview/transform?file=${encodeURIComponent(file)}`,
			transformSchema,
		);
		if (requestId === activeCompile) renderResult(result);
	} catch (error) {
		if (requestId !== activeCompile) return;
		if (!sourceLoaded) {
			ui.sourceCode.textContent = "Source could not be read.";
			ui.sourceLines.textContent = "—";
		}
		ui.compiledCode.textContent = "No transformed output.";
		ui.outputLines.textContent = "—";
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
		ui.projectRoot.textContent = info.root;
		const hasPandwind = info.pandwindPlugins.length > 0;
		setCompilerStatus(hasPandwind ? "Pandwind active" : "Vite ready · no Pandwind plugin", hasPandwind ? "active" : "warning");
		ui.pluginSummary.textContent = info.plugins.length === 0
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
ui.refresh.addEventListener("click", () => {
	if (selectedFile !== "") void compileFile(selectedFile);
});

void start();
