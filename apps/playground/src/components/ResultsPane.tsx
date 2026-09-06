import { useEffect, useMemo, useState } from "react";
import { codeToHtml } from "shiki";
import type { StyleProgram } from "pandwind-codemod/swap/semantic-ir";
import { GhostButton, Pane, ResizableSplitter, type ResizableSplitterPanel } from "./ui.tsx";
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

type InspectorValue =
	| null
	| boolean
	| number
	| string
	| InspectorValue[]
	| { [key: string]: InspectorValue };

function toInspectorValue(value: unknown): InspectorValue {
	if (
		value === null ||
		typeof value === "boolean" ||
		typeof value === "number" ||
		typeof value === "string"
	) {
		return value;
	}
	if (Array.isArray(value)) return value.map(toInspectorValue);
	if (typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value)
				.filter(([, child]) => child !== undefined)
				.map(([key, child]) => [key, toInspectorValue(child)]),
		);
	}
	return String(value);
}

function inspectorEntries(value: InspectorValue): Array<[string, InspectorValue]> {
	if (Array.isArray(value)) return value.map((child, index) => [String(index), child]);
	if (typeof value === "object" && value !== null) return Object.entries(value);
	return [];
}

function inspectorSummary(value: InspectorValue): string {
	if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? "item" : "items"}`;
	if (typeof value === "object" && value !== null) {
		const count = Object.keys(value).length;
		return `${count} ${count === 1 ? "property" : "properties"}`;
	}
	if (typeof value === "string") return JSON.stringify(value);
	return String(value);
}

const IR_EXPLORER = uiCss.class({
	display: "grid",
	height: "100%",
	minHeight: "0px",
	gridTemplateColumns: "minmax(12rem, 0.9fr) minmax(14rem, 1.1fr)",
	"@media (max-width: 760px)": {
		gridTemplateColumns: "1fr",
		gridTemplateRows: "minmax(9rem, 0.8fr) minmax(9rem, 1.2fr)",
	},
});
const IR_TREE = uiCss.class({
	minWidth: "0px",
	minHeight: "0px",
	overflow: "auto",
	padding: "6px 0",
});
const IR_DETAIL = uiCss.class({
	minWidth: "0px",
	minHeight: "0px",
	overflow: "auto",
	borderLeft: "1px solid rgba(255,255,255,0.06)",
	"@media (max-width: 760px)": { borderTop: "1px solid rgba(255,255,255,0.06)", borderLeft: "0" },
});
const IR_ROW = uiCss.class({
	display: "flex",
	minWidth: "0px",
	alignItems: "center",
	minHeight: "25px",
	paddingRight: "8px",
});
const IR_DISCLOSURE = uiCss.class({
	display: "grid",
	width: "22px",
	height: "24px",
	flexShrink: "0",
	placeItems: "center",
	border: "0",
	backgroundColor: "transparent",
	padding: "0",
	fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
	fontSize: "11px",
	color: "#71717a",
	"&:hover": { color: "#f4f4f5" },
});
const IR_NODE = uiCss.class({
	display: "flex",
	minWidth: "0px",
	flex: "1 1 0%",
	alignItems: "baseline",
	justifyContent: "space-between",
	gap: "8px",
	border: "0",
	borderRadius: "4px",
	backgroundColor: "transparent",
	padding: "4px 6px",
	textAlign: "left",
	fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
	fontSize: "11px",
	color: "#a1a1aa",
	"&:hover": { backgroundColor: "rgba(255,255,255,0.05)", color: "#e4e4e7" },
});
const IR_NODE_SELECTED = uiCss.class({
	backgroundColor: "rgba(251,146,60,0.12)",
	color: "#fed7aa",
});
const IR_NODE_LABEL = uiCss.class({
	minWidth: "0px",
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
});
const IR_NODE_SUMMARY = uiCss.class({
	flexShrink: "0",
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
	color: "#52525b",
});
const IR_DETAIL_HEADER = uiCss.class({
	display: "flex",
	minWidth: "0px",
	flexDirection: "column",
	gap: "4px",
	borderBottom: "1px solid rgba(255,255,255,0.06)",
	padding: "10px 12px",
});
const IR_DETAIL_KICKER = uiCss.class({
	fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
	fontSize: "9px",
	textTransform: "uppercase",
	letterSpacing: "0.1em",
	color: "#52525b",
});
const IR_DETAIL_PATH = uiCss.class({
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
	fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
	fontSize: "11px",
	color: "#fed7aa",
});
const IR_RAW = uiCss.class({ flexShrink: "0", borderTop: "1px solid rgba(255,255,255,0.06)" });
const IR_RAW_SUMMARY = uiCss.class({
	cursor: "pointer",
	padding: "9px 12px",
	fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
	fontSize: "10.5px",
	color: "#71717a",
	"&:hover": { color: "#e4e4e7" },
});

function StyleProgramTreeNode(props: {
	label: string;
	path: string;
	value: InspectorValue;
	depth: number;
	selectedPath: string;
	expandedPaths: ReadonlySet<string>;
	onToggle: (path: string) => void;
	onSelect: (path: string, value: InspectorValue) => void;
}) {
	const entries = inspectorEntries(props.value);
	const expandable = entries.length > 0;
	const expanded = props.expandedPaths.has(props.path);
	return (
		<div>
			<div className={IR_ROW} style={{ paddingLeft: `${props.depth * 14}px` }}>
				<button
					type="button"
					className={IR_DISCLOSURE}
					disabled={!expandable}
					aria-label={expandable ? `${expanded ? "Collapse" : "Expand"} ${props.path}` : undefined}
					onClick={() => props.onToggle(props.path)}
				>
					{expandable ? (expanded ? "▾" : "▸") : "·"}
				</button>
				<button
					type="button"
					className={`${IR_NODE} ${props.selectedPath === props.path ? IR_NODE_SELECTED : ""}`}
					onClick={() => props.onSelect(props.path, props.value)}
				>
					<span className={IR_NODE_LABEL}>{props.label}</span>
					<span className={IR_NODE_SUMMARY}>{inspectorSummary(props.value)}</span>
				</button>
			</div>
			{expanded &&
				entries.map(([label, value]) => (
					<StyleProgramTreeNode
						key={`${props.path}.${label}`}
						label={label}
						path={Array.isArray(props.value) ? `${props.path}[${label}]` : `${props.path}.${label}`}
						value={value}
						depth={props.depth + 1}
						selectedPath={props.selectedPath}
						expandedPaths={props.expandedPaths}
						onToggle={props.onToggle}
						onSelect={props.onSelect}
					/>
				))}
		</div>
	);
}

function StyleProgramSection(props: { programs: StyleProgram[] }) {
	const rootValue = useMemo(
		() => toInspectorValue(props.programs.length === 1 ? props.programs[0] : props.programs),
		[props.programs],
	);
	const rawCode = JSON.stringify(rootValue, null, 2);
	const [selectedNode, setSelectedNode] = useState<{ path: string; value: InspectorValue }>(() => ({
		path: "root",
		value: rootValue,
	}));
	const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(() => new Set(["root"]));
	useEffect(() => {
		setSelectedNode({ path: "root", value: rootValue });
		setExpandedPaths(new Set(["root"]));
	}, [rootValue]);
	const togglePath = (path: string) => {
		setExpandedPaths((current) => {
			const next = new Set(current);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	};
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
			<div className={IR_EXPLORER}>
				<div className={IR_TREE}>
					<StyleProgramTreeNode
						label={Array.isArray(rootValue) ? "programs" : "program"}
						path="root"
						value={rootValue}
						depth={0}
						selectedPath={selectedNode.path}
						expandedPaths={expandedPaths}
						onToggle={togglePath}
						onSelect={(path, value) => setSelectedNode({ path, value })}
					/>
				</div>
				<div className={IR_DETAIL}>
					<div className={IR_DETAIL_HEADER}>
						<span className={IR_DETAIL_KICKER}>selected node</span>
						<code className={IR_DETAIL_PATH}>{selectedNode.path}</code>
					</div>
					<Snippet code={JSON.stringify(selectedNode.value, null, 2)} lang="json" />
				</div>
			</div>
			<div className={IR_RAW}>
				<details>
					<summary className={IR_RAW_SUMMARY}>show raw JSON</summary>
					<Snippet code={rawCode} lang="json" />
				</details>
			</div>
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
					height: "100%",
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
	const panels: ResizableSplitterPanel[] = [
		{
			id: "class-string",
			initialSize: 14,
			minSize: 8,
			content: (
				<Pane
					label="Class string"
					className={uiCss.class({ height: "100%" })}
					right={<CopyButton text={r.output} />}
				>
					<Snippet code={r.output} lang="css" />
				</Pane>
			),
		},
		{
			id: "build-time-fold",
			initialSize: 11,
			minSize: 7,
			content: <FoldSection fold={r.fold} note={r.foldNote} />,
		},
		{
			id: "tokens",
			initialSize: 13,
			minSize: 7,
			content: <TokensSection survived={r.survived} killed={r.killed} />,
		},
	];
	if (r.atomDeclarations.length > 0) {
		panels.push({
			id: "css-atoms",
			initialSize: 15,
			minSize: 8,
			content: <AtomsSection atoms={r.atomDeclarations} />,
		});
	}
	if (r.styleMappings.length > 0) {
		panels.push({
			id: "declarations-to-classes",
			initialSize: 18,
			minSize: 8,
			content: <StyleMappingsSection mappings={r.styleMappings} />,
		});
	}
	for (const [index, sheet] of r.sheets.entries()) {
		panels.push({
			id: `generated-css-${index + 1}`,
			initialSize: 10,
			minSize: 8,
			content: <SheetSection sheets={[sheet]} />,
		});
	}
	if (r.programs.length > 0) {
		panels.push({
			id: "styleprogram-ir",
			initialSize: 20,
			minSize: 8,
			content: <StyleProgramSection programs={r.programs} />,
		});
	}
	return (
		<div
			className={uiCss.class({
				display: "flex",
				height: "100%",
				minHeight: "0px",
				overflow: "hidden",
			})}
		>
			<ResizableSplitter orientation="vertical" panels={panels} />
		</div>
	);
}
