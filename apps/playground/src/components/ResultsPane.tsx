import { useEffect, useMemo, useState } from "react";
import { codeToHtml } from "shiki";
import { tw } from "../tw.ts";
import type { PlaygroundResult } from "../lib/eval-playground.ts";

const PANE =
	"flex-1 min-w-0 flex flex-col overflow-hidden rounded-lg border border-white/10 bg-[#11141a]";
const HEAD = "flex items-center justify-between px-3 py-2 border-b border-white/10 text-gray-400";

function CopyButton(props: { text: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			type="button"
			className={tw({
				textSize: "xs",
				px: "2",
				py: "0.5",
				rounded: "sm",
				border: true,
				textColor: copied ? "green-500" : "gray-400",
				cursor: "pointer",
			})}
			onClick={() => {
				void navigator.clipboard.writeText(props.text).then(() => {
					setCopied(true);
					setTimeout(() => setCopied(false), 1200);
				});
			}}
		>
			{copied ? "copied ✓" : "copy"}
		</button>
	);
}

/** Shiki-highlighted read-only snippet. */
function Snippet(props: { code: string; lang: string }) {
	const [html, setHtml] = useState("");
	useEffect(() => {
		let cancelled = false;
		codeToHtml(props.code, { lang: props.lang, theme: "github-dark-default" })
			.then((out) => {
				if (!cancelled) setHtml(out);
			})
			.catch(() => {
				if (!cancelled) setHtml(`<pre>${props.code}</pre>`);
			});
		return () => {
			cancelled = true;
		};
	}, [props.code, props.lang]);
	const base = tw({ textSize: "xs", m: "0", p: "3", overflow: "auto" });
	if (html === "") return <pre className={base}>{props.code}</pre>;
	return <div className={base} dangerouslySetInnerHTML={{ __html: html }} />;
}

const FOLD_STYLES: Record<string, string> = {
	full: "text-green-500 border-green-500/30",
	partial: "text-yellow-500 border-yellow-500/30",
	runtime: "text-orange-400 border-orange-400/30",
};

export function ResultsPane(props: { result: PlaygroundResult }) {
	const cssText = useMemo(() => {
		if (!props.result.ok) return "";
		return `.result {\n  /* compiled by Tailwind at app build time —\n     the class string above IS the stylesheet contract */ }`;
	}, [props.result]);

	return (
		<div className={tw({ flex: "col", gap: "3", minH: "0", grow: true })}>
			{!props.result.ok && (
				<div className={`${PANE} ${tw({ borderColor: "red-500/40" })}`}>
					<div className={HEAD}>
						<span className={tw({ textSize: "sm", textColor: "red-400" })}>error</span>
					</div>
					<pre className={tw({ textSize: "xs", p: "3", textColor: "red-300", overflow: "auto" })}>
						{props.result.error}
					</pre>
				</div>
			)}
			{props.result.ok && (
				<>
					<div className={PANE}>
						<div className={HEAD}>
							<span className={tw({ textSize: "sm", font: "bold" })}>class string</span>
							<CopyButton text={props.result.output} />
						</div>
						<Snippet code={props.result.output} lang="css" />
					</div>

					<div className={PANE}>
						<div className={HEAD}>
							<span
								className={tw({
									textSize: "xs",
									px: "2",
									py: "0.5",
									rounded: "sm",
									border: true,
									...{},
								})}
							>
								<span className={FOLD_STYLES[props.result.fold] ?? ""}>
									fold: {props.result.fold}
								</span>
							</span>
						</div>
						<p className={tw({ textSize: "xs", textColor: "gray-400", px: "3", py: "2" })}>
							{props.result.foldNote}
						</p>
					</div>

					<div className={tw({ ...{}, grow: true })} />

					<div className={PANE}>
						<div className={HEAD}>
							<span className={tw({ textSize: "sm", font: "bold" })}>merge visualization</span>
						</div>
						<div
							className={
								// @ts-expect-error flex-wrap key exists at runtime; union omits it
								tw({ flex: true, "flex-wrap": true, gap: "1", p: "2" })
							}
						>
							{props.result.survived.map((token) => (
								<span
									key={`s:${token}`}
									className={tw({
										textSize: "xs",
										px: "2",
										py: "0.5",
										rounded: "sm",
										bgColor: "green-950",
										textColor: "green-400",
									})}
								>
									✓ {token}
								</span>
							))}
							{props.result.killed.map((token) => (
								<span
									key={`k:${token}`}
									className={tw({
										textSize: "xs",
										px: "2",
										py: "0.5",
										rounded: "sm",
										bgColor: "red-950",
										textColor: "red-400",
									})}
								>
									✗ {token}
								</span>
							))}
						</div>
					</div>
				</>
			)}
			{!props.result.ok && <div />}
			{/* keep pane heights stable; css preview reserved for the tailwind-browser lane */}
			<style>{cssText === "" ? "" : ""}</style>
		</div>
	);
}
