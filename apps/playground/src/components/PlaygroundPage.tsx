import { useCallback, useEffect, useMemo, useState } from "react";
import { cx } from "../cx.ts";
import { tw } from "../tw.ts";
import type { ExampleDef } from "../lib/examples.ts";
import { evalPlayground } from "../lib/eval-playground.ts";
import { resolveDesignStyle } from "../../../../packages/pandwind/src/design/resolve.ts";
import { css as designCss } from "../css.ts";
import { examplePreset } from "pandwind/preset";
import { EditorPane } from "./EditorPane.tsx";
import { ResultsPane } from "./ResultsPane.tsx";

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

	useEffect(() => {
		run(code);
	}, []);

	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key === "Enter") run(code);
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [code, run]);

	const resultPane = useMemo(() => <ResultsPane result={result} />, [result]);

	return (
		<div className={tw({ flex: "col", h: "full", p: "4", gap: "3" })}>
			<div>
				<h1 className={tw({ textSize: "lg", textColor: "white" })}>{props.def.title}</h1>
				<p className={tw({ textSize: "sm", textColor: "gray-400" })}>{props.def.blurb}</p>
			</div>
			<div className={tw({ flex: true, gap: "3", grow: true, minH: "0" })}>
				<EditorPane code={code} onChange={setCode} />
				{resultPane}
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
