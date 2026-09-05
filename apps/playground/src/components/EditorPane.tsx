import MonacoEditor, { type Monaco } from "@monaco-editor/react";
import { EDITOR_TYPE_LIBRARIES, PANDWIND_EDITOR_MODULE_PATHS } from "../lib/editor-types.ts";
import { css as uiCss } from "../ui-css.ts";
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
}

/** Give migration snippets the same generated vocabulary as the real app. */
function configureTypeScript(monaco: Monaco): void {
	const typescript = monaco.languages.typescript;
	const defaults = typescript.typescriptDefaults;
	defaults.setCompilerOptions({
		allowNonTsExtensions: true,
		allowJs: true,
		checkJs: false,
		jsx: typescript.JsxEmit.ReactJSX,
		module: typescript.ModuleKind.ESNext,
		moduleResolution: typescript.ModuleResolutionKind.NodeJs,
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
	for (const library of EDITOR_TYPE_LIBRARIES) {
		defaults.addExtraLib(library.content, library.filePath);
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
					backgroundColor: "#52525b",
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
	className?: string;
}) {
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
						color: "#52525b",
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
					loading={<EditorBooting />}
					height="100%"
					defaultLanguage="typescript"
					theme="pandwind"
					path={props.filePath ?? "file:///pandwind/playground/Example.tsx"}
					beforeMount={(monaco) => {
						defineTheme(monaco);
						configureTypeScript(monaco);
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
