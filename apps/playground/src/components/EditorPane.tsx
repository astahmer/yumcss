import MonacoEditor from "@monaco-editor/react";
import { tw } from "../tw.ts";

const PANE =
	"flex-1 min-w-0 flex flex-col overflow-hidden rounded-lg border border-white/10 bg-[#11141a]";

export function EditorPane(props: { code: string; onChange: (next: string) => void }) {
	return (
		<div className={PANE}>
			<div
				className={tw({
					flex: true,
					items: "center",
					justify: "between",
					px: "3",
					py: "2",
					borderB: true,
					textColor: "gray-400",
				})}
			>
				<span className={tw({ textSize: "sm", font: "bold" })}>editor</span>
				<span className={tw({ textSize: "xs", textColor: "gray-500" })}>⌘/Ctrl + Enter to run</span>
			</div>
			<div className={tw({ grow: true, overflow: "hidden" })}>
				<MonacoEditor
					height="100%"
					defaultLanguage="typescript"
					theme="vs-dark"
					value={props.code}
					onChange={(value) => props.onChange(value ?? "")}
					options={{
						minimap: { enabled: false },
						fontSize: 13,
						lineNumbersMinChars: 3,
						scrollBeyondLastLine: false,
						automaticLayout: true,
						tabSize: 2,
						padding: { top: 10 },
					}}
				/>
			</div>
		</div>
	);
}
