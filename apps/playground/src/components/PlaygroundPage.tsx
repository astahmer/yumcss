import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "../cx.ts";
import { tw } from "../tw.ts";
import { createCss } from "pandwind/css";
import type { ExampleDef, ExampleFile } from "../lib/examples.ts";
import { evalPlayground, evalSiblingModule, type EvalInput } from "../lib/eval-playground.ts";
import { resolveDesignStyle } from "pandwind/design/resolve";
import { css as designCss } from "../css.ts";
import { examplePreset } from "pandwind/preset";
import { SANDBOX_MODULES } from "../lib/sandbox-modules.ts";
import { EditorPane } from "./EditorPane.tsx";
import { ResultsPane } from "./ResultsPane.tsx";
import { GhostButton } from "./ui.tsx";

/** Component-like dynamics available inside evaluated code as `props`. */
const SANDBOX_PROPS = { active: true, tone: "red-600" };

function encodeCode(code: string): string {
	return btoa(String.fromCharCode(...new TextEncoder().encode(code)));
}

function decodeCode(encoded: string): string | null {
	try {
		return new TextDecoder().decode(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)));
	} catch {
		return null;
	}
}

/**
 * Evaluate every sibling tab in module mode; their exported bindings become
 * the `./name` import surface the entry tab resolves against — the same
 * module graph a real bundler would see.
 */
function evalSiblings(sources: readonly string[], def: ExampleDef): EvalInput["moduleBindings"] {
	if (def.files.length <= 1) return undefined;
	const bindings: Record<string, Record<string, unknown>> = {};
	for (let index = 1; index < def.files.length; index++) {
		const file: ExampleFile = def.files[index]!;
		try {
			bindings["./" + file.name] = evalSiblingModule(makeInput(sources[index] ?? file.code));
		} catch (error) {
			throw new Error(file.name + ": " + (error instanceof Error ? error.message : String(error)), {
				cause: error,
			});
		}
	}
	return bindings;
}

export function PlaygroundPage(props: { def: ExampleDef }) {
	const [files, setFiles] = useState<readonly string[]>(() => {
		const hash = window.location.hash.slice(1);
		if (hash !== "") {
			const decoded = decodeCode(hash);
			if (decoded !== null && decoded.trim() !== "") {
				return [decoded, ...props.def.files.slice(1).map((file) => file.code)];
			}
		}
		return props.def.files.map((file) => file.code);
	});
	const [activeTab, setActiveTab] = useState(0);
	const [result, setResult] = useState(() =>
		evalPlayground(makeInput(files[0]!, evalSiblings(files, props.def))),
	);
	const run = useCallback(
		(sources: readonly string[]) => {
			try {
				setResult(evalPlayground(makeInput(sources[0]!, evalSiblings(sources, props.def))));
			} catch (error) {
				setResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
			}
			const hash =
				sources[0]!.trim() === props.def.files[0]!.code ? "" : "#" + encodeCode(sources[0]!);
			history.replaceState(null, "", window.location.pathname + window.location.search + hash);
		},
		[props.def],
	);

	// Live evaluation: re-run shortly after every edit; ⌘↵ runs immediately.
	// The debounced run reads the latest state through the setter so edits on
	// another tab between keystrokes are never lost.
	const onChange = useCallback(
		(source: string) => {
			setFiles((current) => current.map((code, index) => (index === activeTab ? source : code)));
			window.clearTimeout(debounceRef.current);
			debounceRef.current = window.setTimeout(() => {
				setFiles((latest) => {
					run(latest);
					return latest;
				});
			}, 300);
		},
		[activeTab, run],
	);

	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key === "Enter") run(files);
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [files, run]);

	// Flush a pending debounced run on unmount only — clearing on every
	// re-render would cancel the run scheduled by the last keystroke.
	const debounceRef = useRef<number>(0);
	useEffect(() => () => window.clearTimeout(debounceRef.current), []);

	const dirty = files.some(
		(code, index) => code.trim() !== (props.def.files[index]?.code ?? "").trim(),
	);
	const reset = useCallback(() => {
		window.clearTimeout(debounceRef.current);
		const restored = props.def.files.map((file) => file.code);
		setFiles(restored);
		run(restored);
	}, [props.def, run]);

	return (
		<div className="flex h-full min-h-0 flex-col gap-3 p-4">
			<div className="flex h-6 shrink-0 items-center justify-between">
				<div className="flex items-baseline gap-3">
					<h1 className="text-[13px] font-medium text-zinc-200">{props.def.title}</h1>
					<p className="hidden text-[12px] text-zinc-600 md:block">{props.def.blurb}</p>
				</div>
				{dirty && (
					<GhostButton onClick={reset} title="Restore the example code">
						reset
					</GhostButton>
				)}
			</div>
			{props.def.files.length > 1 && (
				<div className="flex h-7 shrink-0 items-center gap-1 overflow-x-auto" role="tablist">
					{props.def.files.map((file, index) => (
						<button
							key={file.name}
							type="button"
							role="tab"
							aria-selected={index === activeTab}
							onClick={() => setActiveTab(index)}
							className={
								"rounded-md px-2.5 py-1 font-mono text-[12px] leading-5 transition-colors " +
								(index === activeTab
									? "bg-white/[0.07] text-zinc-100"
									: "text-zinc-500 hover:text-zinc-300")
							}
						>
							{file.name}
						</button>
					))}
				</div>
			)}
			<div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
				<EditorPane
					code={files[activeTab] ?? ""}
					onChange={onChange}
					onRun={() => run(files)}
					filePath={
						"file:///pandwind/playground/" + (props.def.files[activeTab]?.name ?? "Example.tsx")
					}
					className="min-h-72"
				/>
				<ResultsPane result={result} />
			</div>
		</div>
	);
}

function makeInput(code: string, moduleBindings?: EvalInput["moduleBindings"]): EvalInput {
	return {
		code,
		tw: tw as unknown as (...args: Array<unknown>) => unknown,
		css: designCss as unknown as ((...args: Array<unknown>) => unknown) & Record<string, unknown>,
		cx: cx as unknown as (...inputs: Array<never>) => string,
		createCss: createCss as unknown as (...args: Array<unknown>) => unknown,
		moduleBindings:
			moduleBindings === undefined ? SANDBOX_MODULES : { ...SANDBOX_MODULES, ...moduleBindings },
		props: SANDBOX_PROPS,
		resolveCss: (style: Record<string, unknown>) => {
			const resolved = resolveDesignStyle(style, examplePreset.tokens);
			const out: Record<string, string> = {};
			for (const [prop, value] of Object.entries(resolved)) {
				out[String(prop)] = String(value);
			}
			return out;
		},
	};
}
