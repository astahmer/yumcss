import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "../cx.ts";
import { tw } from "../tw.ts";
import type { ExampleDef } from "../lib/examples.ts";
import { evalPlayground } from "../lib/eval-playground.ts";
import { resolveDesignStyle } from "../../../../packages/pandwind/src/design/resolve.ts";
import { css as designCss } from "../css.ts";
import { examplePreset } from "pandwind/preset";
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

export function PlaygroundPage(props: { def: ExampleDef }) {
	const [code, setCode] = useState<string>(() => {
		const hash = window.location.hash.slice(1);
		if (hash !== "") {
			const decoded = decodeCode(hash);
			if (decoded !== null && decoded.trim() !== "") return decoded;
		}
		return props.def.code;
	});
	const [result, setResult] = useState(() => evalPlayground(makeInput(code)));
	const run = useCallback(
		(source: string) => {
			setResult(evalPlayground(makeInput(source)));
			const hash = source.trim() === props.def.code ? "" : `#${encodeCode(source)}`;
			history.replaceState(null, "", `${window.location.pathname}${window.location.search}${hash}`);
		},
		[props.def.code],
	);

	// Live evaluation: re-run shortly after every edit; ⌘↵ runs immediately.
	const onChange = useCallback(
		(source: string) => {
			setCode(source);
			window.clearTimeout(debounceRef.current);
			debounceRef.current = window.setTimeout(() => run(source), 300);
		},
		[run],
	);

	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key === "Enter") run(code);
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [code, run]);

	// Flush a pending debounced run on unmount only — clearing on every
	// re-render would cancel the run scheduled by the last keystroke.
	const debounceRef = useRef<number>(0);
	useEffect(() => () => window.clearTimeout(debounceRef.current), []);

	const dirty = code.trim() !== props.def.code.trim();
	const reset = useCallback(() => {
		window.clearTimeout(debounceRef.current);
		setCode(props.def.code);
		run(props.def.code);
	}, [props.def.code, run]);

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
			<div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
				<EditorPane code={code} onChange={onChange} onRun={() => run(code)} className="min-h-72" />
				<ResultsPane result={result} />
			</div>
		</div>
	);
}

function makeInput(code: string) {
	return {
		code,
		tw: tw as unknown as (...args: Array<unknown>) => unknown,
		css: designCss as unknown as ((...args: Array<unknown>) => unknown) & Record<string, unknown>,
		cx: cx as unknown as (...inputs: Array<never>) => string,
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
