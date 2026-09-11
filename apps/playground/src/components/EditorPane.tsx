import MonacoEditor, { type Monaco } from "@monaco-editor/react";
import {
	EDITOR_TYPE_LIBRARIES,
	PANDWIND_EDITOR_MODULE_PATHS,
	type EditorTypeLibrary,
} from "../lib/editor-types.ts";
import { css as uiCss } from "../ui-css.ts";
import { useTheme } from "../theme.tsx";
import { Kbd, Pane } from "./ui.tsx";

/**
 * Monaco palette matched to the app chrome (#0e0e11 surface, warm accent).
 * Registered once via beforeMount so the editor never flashes vs-dark.
 */
function defineTheme(monaco: Monaco): void {
	monaco.editor.defineTheme("pandwind", {
		base: "vs-dark",
		inherit: true,
		rules: [
			{ token: "", foreground: "D4D4D8" },
			{ token: "comment", foreground: "5C5C66", fontStyle: "italic" },
			{ token: "keyword", foreground: "E8955C" },
			{ token: "string", foreground: "A9C98F" },
			{ token: "number", foreground: "D8B47A" },
			{ token: "type", foreground: "C8C8D0" },
			{ token: "delimiter", foreground: "6B6B75" },
		],
		colors: {
			"editor.background": "#0E0E11",
			"editor.foreground": "#D4D4D8",
			"editorLineNumber.foreground": "#3F3F46",
			"editorLineNumber.activeForeground": "#8A8A93",
			"editor.selectionBackground": "#2A2A33",
			"editor.lineHighlightBackground": "#16161B",
			"editorCursor.foreground": "#E8955C",
			"editorIndentGuide.background1": "#1C1C22",
			"editorBracketMatch.background": "#26262E",
			"editorBracketMatch.border": "#3F3F46",
			"scrollbarSlider.background": "#26262E80",
			"scrollbarSlider.hoverBackground": "#33333D80",
		},
	});
	monaco.editor.defineTheme("pandwind-light", {
		base: "vs",
		inherit: true,
		rules: [
			{ token: "", foreground: "334155" },
			{ token: "comment", foreground: "8491A3", fontStyle: "italic" },
			{ token: "keyword", foreground: "9A4B2F" },
			{ token: "string", foreground: "3B704F" },
			{ token: "number", foreground: "8A5C13" },
			{ token: "type", foreground: "40516A" },
			{ token: "delimiter", foreground: "64748B" },
		],
		colors: {
			"editor.background": "#F8FAFC",
			"editor.foreground": "#334155",
			"editorLineNumber.foreground": "#A8B3C1",
			"editorLineNumber.activeForeground": "#64748B",
			"editor.selectionBackground": "#DDE7F0",
			"editor.lineHighlightBackground": "#EEF2F6",
			"editorCursor.foreground": "#B45F3E",
			"editorIndentGuide.background1": "#E2E8F0",
			"editorBracketMatch.background": "#E4ECF3",
			"editorBracketMatch.border": "#A8B3C1",
			"scrollbarSlider.background": "#CBD5E180",
			"scrollbarSlider.hoverBackground": "#94A3B880",
		},
	});
}

const installedEditorLibraries = new Map<
	string,
	{ content: string; dispose: { dispose: () => void } }
>();

/** Give migration snippets the same generated vocabulary as the real app. */
function configureTypeScript(monaco: Monaco, fileLibraries: readonly EditorTypeLibrary[]): void {
	const typescript = monaco.languages.typescript;
	const defaults = typescript.typescriptDefaults;
	defaults.setCompilerOptions({
		allowNonTsExtensions: true,
		allowJs: true,
		checkJs: false,
		jsx: typescript.JsxEmit.ReactJSX,
		module: typescript.ModuleKind.ESNext,
		moduleResolution: typescript.ModuleResolutionKind.Bundler,
		allowImportingTsExtensions: true,
		baseUrl: "file:///pandwind/playground",
		paths: Object.fromEntries(
			Object.entries(PANDWIND_EDITOR_MODULE_PATHS).map(([specifier, path]) => [specifier, [path]]),
		),
		target: typescript.ScriptTarget.ES2022,
		noEmit: true,
		strict: true,
	});
	defaults.setDiagnosticsOptions({
		noSemanticValidation: false,
		noSyntaxValidation: false,
	});
	const libraries = [...EDITOR_TYPE_LIBRARIES, ...fileLibraries];
	const desiredPaths = new Set(libraries.map((library) => library.filePath));
	for (const [filePath, installed] of installedEditorLibraries) {
		if (!desiredPaths.has(filePath)) {
			installed.dispose.dispose();
			installedEditorLibraries.delete(filePath);
		}
	}
	for (const library of libraries) {
		const installed = installedEditorLibraries.get(library.filePath);
		if (installed?.content === library.content) continue;
		installed?.dispose.dispose();
		installedEditorLibraries.set(library.filePath, {
			content: library.content,
			dispose: defaults.addExtraLib(library.content, library.filePath),
		});
	}
}

/** Quiet stand-in while the Monaco chunk loads: a single breathing dot. */
function EditorBooting() {
	return (
		<div
			className={uiCss.class({
				display: "flex",
				height: "100%",
				alignItems: "center",
				justifyContent: "center",
			})}
		>
			<span
				className={uiCss.class({
					width: "6px",
					height: "6px",
					borderRadius: "9999px",
					backgroundColor: "textFaint",
					animation: "pulse 1.5s ease-in-out infinite",
				})}
			/>
		</div>
	);
}

export function EditorPane(props: {
	code: string;
	onChange: (next: string) => void;
	onRun: () => void;
	filePath?: string;
	fileLibraries?: readonly EditorTypeLibrary[];
	className?: string;
}) {
	const { mode } = useTheme();
	const filePath = props.filePath ?? "file:///pandwind/playground/Example.tsx";
	return (
		<Pane
			label="Editor"
			className={props.className}
			right={
				<span
					className={uiCss.class({
						display: "flex",
						alignItems: "center",
						gap: "6px",
						paddingRight: "4px",
						fontSize: "11px",
						color: "textFaint",
					})}
				>
					<Kbd>⌘</Kbd>
					<Kbd>↵</Kbd>
					<span
						className={uiCss.class({
							display: "none",
							marginLeft: "4px",
							"@media (min-width: 640px)": { display: "inline" },
						})}
					>
						to run
					</span>
				</span>
			}
		>
			<div aria-label="Code editor" className={uiCss.class({ height: "100%", minHeight: "0px" })}>
				<MonacoEditor
					key={filePath}
					loading={<EditorBooting />}
					height="100%"
					defaultLanguage={filePath.endsWith(".tsx") ? "typescriptreact" : "typescript"}
					theme={mode === "light" ? "pandwind-light" : "pandwind"}
					path={filePath}
					beforeMount={(monaco) => {
						defineTheme(monaco);
						configureTypeScript(monaco, props.fileLibraries ?? []);
					}}
					value={props.code}
					onChange={(value) => props.onChange(value ?? "")}
					options={{
						minimap: { enabled: false },
						fontSize: 13,
						lineHeight: 20,
						fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace',
						fontLigatures: false,
						lineNumbersMinChars: 3,
						scrollBeyondLastLine: false,
						automaticLayout: true,
						tabSize: 2,
						padding: { top: 12, bottom: 12 },
						renderLineHighlight: "line",
						smoothScrolling: true,
						overviewRulerBorder: false,
						scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
						guides: { indentation: false },
						fixedOverflowWidgets: true,
					}}
				/>
			</div>
		</Pane>
	);
}
