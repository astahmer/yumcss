import { useEffect, useState } from "react";
import { codeToHtml } from "shiki";
import { GhostButton, Pane } from "./ui.tsx";
import type { PlaygroundResult } from "../lib/eval-playground.ts";

function CopyButton(props: { text: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<GhostButton
			active={copied}
			title="Copy class string"
			onClick={() => {
				void navigator.clipboard.writeText(props.text).then(() => {
					setCopied(true);
					setTimeout(() => setCopied(false), 1200);
				});
			}}
		>
			<span aria-live="polite">{copied ? "copied" : "copy"}</span>
		</GhostButton>
	);
}

/** Shiki-highlighted read-only snippet, background stripped to match the pane. */
function Snippet(props: { code: string; lang: string }) {
	const [html, setHtml] = useState("");
	useEffect(() => {
		let cancelled = false;
		codeToHtml(props.code, { lang: props.lang, theme: "vesper" })
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
	const base =
		"[&_pre]:m-0 [&_pre]:bg-transparent [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-[12.5px] [&_pre]:leading-5";
	if (html === "")
		return (
			<pre className={base}>
				<code>{props.code}</code>
			</pre>
		);
	return <div className={base} dangerouslySetInnerHTML={{ __html: html }} />;
}

const FOLD_CHIP: Record<string, string> = {
	full: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
	partial: "border-amber-500/25 bg-amber-500/10 text-amber-300",
	runtime: "border-orange-500/25 bg-orange-500/10 text-orange-300",
};

function FoldSection(props: { fold: string; note: string }) {
	return (
		<Pane
			label="Build-time fold"
			right={
				<span
					className={`mr-1 rounded border px-1.5 py-0.5 font-mono text-[10px] leading-none ${FOLD_CHIP[props.fold] ?? "border-white/10 text-zinc-400"}`}
				>
					{props.fold}
				</span>
			}
		>
			<p className="px-3 py-2 text-[12px] text-zinc-500">{props.note}</p>
		</Pane>
	);
}

function TokenPill(props: { token: string; killed: boolean }) {
	return (
		<span
			className={`rounded border px-1.5 py-0.5 font-mono text-[11.5px] leading-4 ${
				props.killed
					? "border-red-500/20 bg-red-500/[0.07] text-red-300/80 line-through decoration-red-400/50"
					: "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300"
			}`}
		>
			{props.token}
		</span>
	);
}

function TokensSection(props: { survived: string[]; killed: string[] }) {
	const { survived, killed } = props;
	if (survived.length === 0 && killed.length === 0) {
		return (
			<Pane label="Tokens">
				<p className="px-3 py-2 text-[12px] text-zinc-600">no class tokens produced</p>
			</Pane>
		);
	}
	return (
		<Pane
			label="Tokens"
			right={
				<span className="mr-1 font-mono text-[10.5px] text-zinc-600">
					<span className="text-emerald-400/90">{survived.length} kept</span>
					{killed.length > 0 && (
						<>
							{" · "}
							<span className="text-red-400/90">{killed.length} dropped</span>
						</>
					)}
				</span>
			}
		>
			<div className="flex flex-wrap content-start gap-1.5 p-3">
				{survived.map((token) => (
					<TokenPill key={`s:${token}`} token={token} killed={false} />
				))}
				{killed.map((token) => (
					<TokenPill key={`k:${token}`} token={token} killed={true} />
				))}
			</div>
		</Pane>
	);
}

/** Resolved declarations per css() literal call (design-layer view). */
function AtomsSection(props: { atoms: Array<{ cls: string; decls: Record<string, string> }> }) {
	return (
		<Pane label="css() atoms">
			<div className="divide-y divide-white/[0.05]">
				{props.atoms.map((atom) => (
					<div key={atom.cls} className="flex items-baseline gap-3 px-3 py-2">
						<span className="shrink-0 font-mono text-[11.5px] text-orange-300/90">.{atom.cls}</span>
						<span className="min-w-0 truncate font-mono text-[11.5px] text-zinc-500">
							{Object.entries(atom.decls)
								.map(([prop, value]) => `${prop}: ${value}`)
								.join("; ")}
							;
						</span>
					</div>
				))}
			</div>
		</Pane>
	);
}

function ErrorSection(props: { error: string }) {
	return (
		<Pane
			label="Error"
			className="border-red-500/20"
			right={<span className="mr-1 font-mono text-[10.5px] text-red-400/70">eval failed</span>}
		>
			<pre className="whitespace-pre-wrap p-3 font-mono text-[12px] leading-5 text-red-300/90">
				{props.error}
			</pre>
		</Pane>
	);
}

export function ResultsPane(props: { result: PlaygroundResult }) {
	const r = props.result;
	if (!r.ok) {
		return (
			<div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
				<ErrorSection error={r.error} />
			</div>
		);
	}
	return (
		<div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-0.5">
			<Pane label="Class string" right={<CopyButton text={r.output} />}>
				<Snippet code={r.output} lang="css" />
			</Pane>
			<FoldSection fold={r.fold} note={r.foldNote} />
			<TokensSection survived={r.survived} killed={r.killed} />
			{r.atomDeclarations.length > 0 && <AtomsSection atoms={r.atomDeclarations} />}
		</div>
	);
}
