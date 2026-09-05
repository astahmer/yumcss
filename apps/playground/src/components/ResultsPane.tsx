import { useEffect, useState } from "react";
import { codeToHtml } from "shiki";
import type { StyleProgram } from "pandwind-codemod/swap/semantic-ir";
import { GhostButton, Pane } from "./ui.tsx";
import type {
	PlaygroundResult,
	PlaygroundSheetResult,
	PlaygroundStyleMapping,
} from "../lib/eval-playground.ts";
import { css as uiCss } from "../ui-css.ts";

function CopyButton(props: { text: string; title?: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<GhostButton
			active={copied}
			title={props.title ?? "Copy class string"}
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
	const snippet = uiCss.class({
		margin: "0",
		backgroundColor: "transparent",
		padding: "12px",
		fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
		fontSize: "12.5px",
		lineHeight: "20px",
	});
	const snippetContainer = uiCss.class({
		"& pre": {
			margin: "0",
			maxHeight: "none",
			overflow: "auto",
			backgroundColor: "transparent",
			padding: "12px",
			fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
			fontSize: "12.5px",
			lineHeight: "20px",
		},
	});
	if (html === "")
		return (
			<pre className={snippet}>
				<code>{props.code}</code>
			</pre>
		);
	return <div className={snippetContainer} dangerouslySetInnerHTML={{ __html: html }} />;
}

const FOLD_CHIP: Record<string, string> = {
	full: uiCss.class({
		borderColor: "rgba(52,211,153,0.25)",
		backgroundColor: "rgba(16,185,129,0.1)",
		color: "#6ee7b7",
	}),
	partial: uiCss.class({
		borderColor: "rgba(251,191,36,0.25)",
		backgroundColor: "rgba(245,158,11,0.1)",
		color: "#fcd34d",
	}),
	runtime: uiCss.class({
		borderColor: "rgba(251,146,60,0.25)",
		backgroundColor: "rgba(249,115,22,0.1)",
		color: "#fdba74",
	}),
};

const MAPPING_STATUS_ACTIVE = uiCss.class({ color: "rgba(52,211,153,0.9)" });
const MAPPING_STATUS_DROPPED = uiCss.class({ color: "rgba(248,113,113,0.75)" });
const MAPPING_CLASS_ACTIVE = uiCss.class({
	minWidth: "0px",
	overflowWrap: "anywhere",
	fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
	fontSize: "11.5px",
	color: "rgba(253,186,116,0.9)",
	textDecoration: "none",
});
const MAPPING_CLASS_DROPPED = uiCss.class({
	minWidth: "0px",
	overflowWrap: "anywhere",
	fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
	fontSize: "11.5px",
	color: "#71717a",
	textDecoration: "line-through",
});

function FoldSection(props: { fold: string; note: string }) {
	return (
		<Pane
			label="Build-time fold"
			right={
				<span
					className={`${uiCss.class({ marginRight: "4px", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", padding: "2px 6px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "10px", lineHeight: "1" })} ${FOLD_CHIP[props.fold] ?? uiCss.class({ color: "#a1a1aa" })}`}
				>
					{props.fold}
				</span>
			}
		>
			<p
				className={uiCss.class({
					margin: "0",
					padding: "8px 12px",
					fontSize: "12px",
					color: "#71717a",
				})}
			>
				{props.note}
			</p>
		</Pane>
	);
}

function TokenPill(props: { token: string; killed: boolean }) {
	return (
		<span
			className={`${uiCss.class({ borderRadius: "4px", border: "1px solid", padding: "2px 6px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "11.5px", lineHeight: "16px" })} ${props.killed ? uiCss.class({ borderColor: "rgba(248,113,113,0.2)", backgroundColor: "rgba(239,68,68,0.07)", color: "rgba(252,165,165,0.8)", textDecoration: "line-through", textDecorationColor: "rgba(248,113,113,0.5)" }) : uiCss.class({ borderColor: "rgba(52,211,153,0.2)", backgroundColor: "rgba(16,185,129,0.07)", color: "#6ee7b7" })}`}
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
				<p
					className={uiCss.class({
						margin: "0",
						padding: "8px 12px",
						fontSize: "12px",
						color: "#52525b",
					})}
				>
					no class tokens produced
				</p>
			</Pane>
		);
	}
	return (
		<Pane
			label="Tokens"
			right={
				<span
					className={uiCss.class({
						marginRight: "4px",
						fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
						fontSize: "10.5px",
						color: "#52525b",
					})}
				>
					<span className={uiCss.class({ color: "rgba(52,211,153,0.9)" })}>
						{survived.length} kept
					</span>
					{killed.length > 0 && (
						<>
							{" · "}
							<span className={uiCss.class({ color: "rgba(248,113,113,0.9)" })}>
								{killed.length} dropped
							</span>
						</>
					)}
				</span>
			}
		>
			<div
				className={uiCss.class({
					display: "flex",
					flexWrap: "wrap",
					alignContent: "flex-start",
					gap: "6px",
					padding: "12px",
				})}
			>
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
			<div
				className={uiCss.class({ "& > * + *": { borderTop: "1px solid rgba(255,255,255,0.05)" } })}
			>
				{props.atoms.map((atom) => (
					<div
						key={atom.cls}
						className={uiCss.class({
							display: "flex",
							minWidth: "0px",
							alignItems: "baseline",
							gap: "12px",
							padding: "8px 12px",
						})}
					>
						<span
							className={uiCss.class({
								flexShrink: "0",
								fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
								fontSize: "11.5px",
								color: "rgba(253,186,116,0.9)",
							})}
						>
							.{atom.cls}
						</span>
						<span
							className={uiCss.class({
								minWidth: "0px",
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
								fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
								fontSize: "11.5px",
								color: "#71717a",
							})}
						>
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

function StyleMappingsSection(props: { mappings: PlaygroundStyleMapping[] }) {
	return (
		<Pane
			label="Declarations to classes"
			right={
				<span
					className={uiCss.class({
						marginRight: "4px",
						fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
						fontSize: "10.5px",
						color: "#71717a",
					})}
				>
					{props.mappings.length} {props.mappings.length === 1 ? "declaration" : "declarations"}
				</span>
			}
		>
			<div
				className={uiCss.class({
					"& > * + *": { borderTop: "1px solid rgba(255,255,255,0.05)" },
				})}
			>
				{props.mappings.map((mapping, index) => (
					<div
						key={`${mapping.className}:${mapping.property}:${mapping.value}:${index}`}
						className={uiCss.class({
							display: "grid",
							gridTemplateColumns: "minmax(0, 1fr) minmax(150px, 0.8fr)",
							gap: "12px",
							alignItems: "center",
							padding: "8px 12px",
							"@media (max-width: 760px)": {
								gridTemplateColumns: "1fr",
							},
						})}
					>
						<div
							className={uiCss.class({
								display: "flex",
								minWidth: "0px",
								flexWrap: "wrap",
								alignItems: "baseline",
								gap: "6px",
								fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
								fontSize: "11.5px",
							})}
						>
							<span className={uiCss.class({ color: "#fbbf24" })}>{mapping.property}</span>
							<span className={uiCss.class({ color: "#d4d4d8" })}>: {mapping.value}</span>
							<span className={uiCss.class({ color: "#a1a1aa" })}>
								{mapping.conditions.length === 0 ? "base" : mapping.conditions.join(" / ")}
							</span>
							<span className={mapping.active ? MAPPING_STATUS_ACTIVE : MAPPING_STATUS_DROPPED}>
								{mapping.active ? "final" : "dropped"}
							</span>
						</div>
						<code className={mapping.active ? MAPPING_CLASS_ACTIVE : MAPPING_CLASS_DROPPED}>
							.{mapping.className}
						</code>
					</div>
				))}
			</div>
		</Pane>
	);
}

function SheetSection(props: { sheets: PlaygroundSheetResult[] }) {
	return (
		<>
			{props.sheets.map((sheet, index) => (
				<Pane
					key={`${sheet.strategy}:${index}`}
					label="Generated CSS"
					right={
						<span
							className={uiCss.class({
								marginRight: "4px",
								fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
								fontSize: "10.5px",
								color: "#71717a",
							})}
						>
							{sheet.strategy} · {sheet.rules.length} {sheet.rules.length === 1 ? "rule" : "rules"}
						</span>
					}
				>
					<div className={uiCss.class({ position: "relative" })}>
						<div
							className={uiCss.class({
								position: "absolute",
								top: "4px",
								right: "8px",
								zIndex: "1",
							})}
						>
							<CopyButton text={sheet.css} title="Copy generated CSS" />
						</div>
						<Snippet code={sheet.css || "/* no CSS rules registered */"} lang="css" />
					</div>
				</Pane>
			))}
		</>
	);
}

function StyleProgramSection(props: { programs: StyleProgram[] }) {
	const code = JSON.stringify(
		props.programs.length === 1 ? props.programs[0] : props.programs,
		null,
		2,
	);
	return (
		<Pane
			label="StyleProgram IR"
			right={
				<span
					className={uiCss.class({
						marginRight: "4px",
						fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
						fontSize: "10.5px",
						color: "#71717a",
					})}
				>
					{props.programs.length} {props.programs.length === 1 ? "program" : "programs"}
				</span>
			}
		>
			<Snippet code={code} lang="json" />
		</Pane>
	);
}

function ErrorSection(props: { error: string }) {
	return (
		<Pane
			label="Error"
			className={uiCss.class({ borderColor: "rgba(239,68,68,0.2)" })}
			right={
				<span
					className={uiCss.class({
						marginRight: "4px",
						fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
						fontSize: "10.5px",
						color: "rgba(248,113,113,0.7)",
					})}
				>
					eval failed
				</span>
			}
		>
			<pre
				className={uiCss.class({
					margin: "0",
					whiteSpace: "pre-wrap",
					padding: "12px",
					fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
					fontSize: "12px",
					lineHeight: "20px",
					color: "rgba(252,165,165,0.9)",
				})}
			>
				{props.error}
			</pre>
		</Pane>
	);
}

export function ResultsPane(props: { result: PlaygroundResult }) {
	const r = props.result;
	if (!r.ok) {
		return (
			<div
				className={uiCss.class({
					display: "flex",
					minHeight: "0px",
					flexDirection: "column",
					gap: "12px",
					overflowY: "auto",
				})}
			>
				<ErrorSection error={r.error} />
			</div>
		);
	}
	return (
		<div
			className={uiCss.class({
				display: "flex",
				minHeight: "0px",
				flexDirection: "column",
				gap: "12px",
				overflowY: "auto",
				paddingRight: "2px",
			})}
		>
			<Pane label="Class string" right={<CopyButton text={r.output} />}>
				<Snippet code={r.output} lang="css" />
			</Pane>
			<FoldSection fold={r.fold} note={r.foldNote} />
			<TokensSection survived={r.survived} killed={r.killed} />
			{r.atomDeclarations.length > 0 && <AtomsSection atoms={r.atomDeclarations} />}
			{r.styleMappings.length > 0 && <StyleMappingsSection mappings={r.styleMappings} />}
			{r.sheets.length > 0 && <SheetSection sheets={r.sheets} />}
			{r.programs.length > 0 && <StyleProgramSection programs={r.programs} />}
		</div>
	);
}
