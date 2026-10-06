import {
	createElement,
	Fragment,
	useEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type ReactNode,
} from "react";
import { codeToHtml } from "shiki";
import type { StyleProgram } from "@yumcss/codemod/swap/semantic-ir";
import { GhostButton, Pane, ResizableSplitter, type ResizableSplitterPanel } from "./ui.tsx";
import type {
	PlaygroundExecutionEvidence,
	PlaygroundHostNode,
	PlaygroundNode,
	PlaygroundResult,
	PlaygroundSheetResult,
	PlaygroundStyleMapping,
} from "../lib/eval-playground.ts";
import { PlaygroundPreviewKind, type ExamplePreview } from "../lib/examples.ts";
import type { PlaygroundTailwindResolver } from "../lib/tailwind-default-resolver.ts";
import { explainPreview } from "../lib/preview-explanation.ts";
import { css as uiCss } from "../ui-css.ts";
import { useTheme } from "../theme.tsx";
import { cx } from "../cx.ts";

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
	const { mode } = useTheme();
	const [html, setHtml] = useState("");
	useEffect(() => {
		let cancelled = false;
		codeToHtml(props.code, {
			lang: props.lang,
			theme: mode === "light" ? "github-light" : "vesper",
		})
			.then((out) => {
				if (!cancelled) setHtml(out);
			})
			.catch(() => {
				if (!cancelled) setHtml(`<pre>${props.code}</pre>`);
			});
		return () => {
			cancelled = true;
		};
	}, [mode, props.code, props.lang]);
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
		borderColor: "borderStrong",
		backgroundColor: "controlHover",
		color: "success",
	}),
	partial: uiCss.class({
		borderColor: "borderStrong",
		backgroundColor: "controlHover",
		color: "warning",
	}),
	runtime: uiCss.class({
		borderColor: "borderStrong",
		backgroundColor: "accentSoft",
		color: "accentText",
	}),
};

const MAPPING_STATUS_ACTIVE = uiCss.class({ color: "success" });
const MAPPING_STATUS_DROPPED = uiCss.class({ color: "danger" });
const MAPPING_CLASS_ACTIVE = uiCss.class({
	minWidth: "0px",
	overflowWrap: "anywhere",
	fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
	fontSize: "11.5px",
	color: "accentText",
	textDecoration: "none",
});
const MAPPING_CLASS_DROPPED = uiCss.class({
	minWidth: "0px",
	overflowWrap: "anywhere",
	fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
	fontSize: "11.5px",
	color: "textMuted",
	textDecoration: "line-through",
});

function FoldSection(props: { fold: string; note: string }) {
	return (
		<Pane
			label="Build-time fold"
			right={
				<span
					className={`${uiCss.class({ marginRight: "4px", border: "strong", borderRadius: "4px", padding: "2px 6px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "10px", lineHeight: "1" })} ${FOLD_CHIP[props.fold] ?? uiCss.class({ color: "textSoft" })}`}
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
					color: "textMuted",
				})}
			>
				{props.note}
			</p>
		</Pane>
	);
}

function EvidenceList(props: {
	label: string;
	values: readonly string[];
	tone: "success" | "warning";
}) {
	return (
		<div
			className={uiCss.class({
				display: "flex",
				flexWrap: "wrap",
				alignItems: "center",
				gap: "6px",
			})}
		>
			<span className={uiCss.class({ color: "textMuted" })}>{props.label}</span>
			{props.values.map((value) => (
				<span
					key={value}
					className={cx(
						uiCss.class({
							border: "1px solid",
							borderRadius: "4px",
							padding: "2px 6px",
							fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
							fontSize: "10px",
						}),
						props.tone === "success"
							? uiCss.class({ borderColor: "success", color: "success" })
							: uiCss.class({ borderColor: "warning", color: "warning" }),
					)}
				>
					{value}
				</span>
			))}
		</div>
	);
}

function ExecutionEvidenceSection(props: { evidence: PlaygroundExecutionEvidence }) {
	return (
		<Pane
			label="Execution evidence"
			right={
				<span
					className={uiCss.class({
						marginRight: "4px",
						border: "strong",
						borderRadius: "4px",
						padding: "2px 6px",
						fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
						fontSize: "10px",
						color: "info",
					})}
				>
					{props.evidence.lane}
				</span>
			}
		>
			<div
				className={uiCss.class({
					display: "grid",
					gap: "8px",
					padding: "10px 12px",
					fontSize: "11px",
					lineHeight: "16px",
					color: "textSoft",
				})}
			>
				<p className={uiCss.class({ margin: "0", color: "text" })}>{props.evidence.note}</p>
				<EvidenceList label="verified" values={props.evidence.verified} tone={"success"} />
				<EvidenceList label="unavailable" values={props.evidence.unavailable} tone={"warning"} />
			</div>
		</Pane>
	);
}

type SuccessfulPlaygroundResult = Extract<PlaygroundResult, { ok: true }>;

const PREVIEW_STAGE = uiCss.class({
	display: "grid",
	height: "100%",
	minHeight: "0px",
	placeItems: "center",
	backgroundColor: "codeSurface",
	padding: "18px",
});
const PREVIEW_FRAME = uiCss.class({
	display: "grid",
	maxWidth: "min(100%, 40rem)",
	gap: "8px",
	justifyItems: "center",
	textAlign: "center",
});
const PREVIEW_DESCRIPTION = uiCss.class({
	maxWidth: "28rem",
	fontSize: "11px",
	lineHeight: "16px",
	opacity: "0.72",
	color: "currentColor",
});
const PREVIEW_INTERACTION = uiCss.class({
	display: "flex",
	maxWidth: "40rem",
	alignItems: "center",
	justifyContent: "center",
	gap: "6px",
	flexWrap: "wrap",
	border: "strong",
	borderRadius: "6px",
	backgroundColor: "control",
	padding: "5px 8px",
	fontSize: "11px",
	lineHeight: "16px",
	color: "textSoft",
});
const PREVIEW_INTERACTION_VALUE = uiCss.class({
	fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
	fontSize: "10px",
	color: "textStrong",
});
const PREVIEW_INTERACTION_CONTROL = uiCss.class({
	height: "22px",
	border: "strong",
	borderRadius: "4px",
	backgroundColor: "control",
	padding: "0 4px",
	fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
	fontSize: "10px",
	color: "textStrong",
});
const PREVIEW_CONTROLS = uiCss.class({
	display: "flex",
	maxWidth: "40rem",
	alignItems: "center",
	justifyContent: "center",
	gap: "6px 10px",
	flexWrap: "wrap",
	border: "strong",
	borderRadius: "6px",
	backgroundColor: "control",
	padding: "6px 8px",
	fontSize: "11px",
	lineHeight: "16px",
	color: "textSoft",
});
const PREVIEW_CONTROL_LABEL = uiCss.class({
	display: "inline-flex",
	alignItems: "center",
	gap: "5px",
});
const PREVIEW_CONTROL_DESCRIPTION = uiCss.class({
	width: "100%",
	maxWidth: "36rem",
	color: "textMuted",
});
const PREVIEW_BUTTON_RESET = uiCss.class({
	border: "0",
	backgroundColor: "transparent",
	font: "inherit",
});
const PREVIEW_COPY = uiCss.class({
	display: "grid",
	gap: "4px",
	justifyItems: "center",
});
const PREVIEW_COMPUTED_PROPERTIES = [
	"background-color",
	"color",
	"border-color",
	"outline-color",
	"fill",
	"stroke",
	"padding",
	"border-radius",
	"font-size",
	"display",
	"gap",
	"margin",
] as const;

let tailwindPreviewResolverPromise: Promise<PlaygroundTailwindResolver> | undefined;

const getTailwindPreviewResolver = (): Promise<PlaygroundTailwindResolver> => {
	tailwindPreviewResolverPromise ??= import("../lib/tailwind-default-resolver.ts").then(
		({ createPlaygroundTailwindResolver }) => createPlaygroundTailwindResolver(),
	);
	return tailwindPreviewResolverPromise;
};

const previewClassName = (result: SuccessfulPlaygroundResult): string =>
	result.propsOutput?.className ??
	result.varsOutput?.class ??
	(result.output || Object.values(result.decls ?? {}).join(" "));

const previewClassTokens = (className: string): string[] => className.split(/\s+/u).filter(Boolean);

const previewClassNames = (result: SuccessfulPlaygroundResult): string => {
	const classNames = new Set(previewClassTokens(previewClassName(result)));
	const collect = (node: PlaygroundNode | undefined): void => {
		if (node === undefined || node === null || typeof node === "boolean") return;
		if (Array.isArray(node)) {
			for (const child of node) collect(child);
			return;
		}
		if (typeof node === "string" || typeof node === "number") return;
		if (!("props" in node)) return;
		const className = node.props.className;
		if (typeof className === "string") {
			for (const token of previewClassTokens(className)) classNames.add(token);
		}
		for (const child of node.children) collect(child);
	};
	collect(result.rendered);
	return [...classNames].join(" ");
};

const previewDeclarations = (result: SuccessfulPlaygroundResult): Record<string, string> => {
	const declarations: Record<string, string> = {};
	for (const atom of result.atomDeclarations) {
		if (!result.survived.includes(atom.cls)) continue;
		Object.assign(declarations, atom.decls);
	}
	return declarations;
};

const tailwindDeclarations = (
	className: string,
	resolver: PlaygroundTailwindResolver,
): Record<string, string> => {
	const declarations: Record<string, string> = {};
	for (const token of className.split(/\s+/u).filter(Boolean)) {
		for (const declaration of resolver.resolve(token) ?? []) {
			if (declaration.conditions.length > 0 || declaration.value.kind !== "literal") continue;
			declarations[declaration.property] = String(declaration.value.value);
		}
	}
	return declarations;
};

const tailwindCss = (className: string, resolver: PlaygroundTailwindResolver): string =>
	className
		.split(/\s+/u)
		.filter(Boolean)
		.map((token) => resolver.css(token))
		.filter((css): css is string => css !== undefined)
		.join("\n");

interface TailwindPreview {
	style: Record<string, string>;
	css: string;
}

const previewStyle = (
	result: SuccessfulPlaygroundResult,
	tailwindStyle: Record<string, string>,
): CSSProperties => ({
	...tailwindStyle,
	...previewDeclarations(result),
	...result.runtimeStyle,
	...result.varsOutput?.style,
	...result.propsOutput?.style,
});

function useTailwindPreview(rootClassName: string, renderedClassNames: string): TailwindPreview {
	const [preview, setPreview] = useState<TailwindPreview>({ style: {}, css: "" });
	useEffect(() => {
		if (rootClassName === "" && renderedClassNames === "") {
			setPreview({ style: {}, css: "" });
			return;
		}
		let cancelled = false;
		void getTailwindPreviewResolver()
			.then(async (resolver) => {
				await resolver.ready;
				if (!cancelled) {
					setPreview({
						style: tailwindDeclarations(rootClassName, resolver),
						css: tailwindCss(renderedClassNames, resolver),
					});
				}
			})
			.catch(() => {
				if (!cancelled) setPreview({ style: {}, css: "" });
			});
		return () => {
			cancelled = true;
		};
	}, [renderedClassNames, rootClassName]);
	return preview;
}

const withPreviewStyle = (
	node: PlaygroundNode,
	style: CSSProperties,
	styledClasses: ReadonlySet<string>,
	applied = false,
	styleOverrides: CSSProperties = {},
): PlaygroundNode => {
	if (Array.isArray(node))
		return node.map((child) =>
			withPreviewStyle(child, style, styledClasses, applied, styleOverrides),
		);
	if (!isPreviewHostNode(node)) return node;
	const className = node.props.className;
	const hasGeneratedClass =
		typeof className === "string" &&
		previewClassTokens(className).some((token) => styledClasses.has(token));
	const hasInlineStyle = node.props.style !== null && typeof node.props.style === "object";
	const hasStyleTarget = hasGeneratedClass || hasInlineStyle;
	const applyHere = !applied && hasStyleTarget;
	const existingStyle =
		node.props.style !== null && typeof node.props.style === "object"
			? (node.props.style as Record<string, unknown>)
			: {};
	const props = applyHere
		? { ...node.props, style: { ...style, ...existingStyle, ...styleOverrides } }
		: node.props;
	return {
		...node,
		props,
		children: node.children.map((child) =>
			withPreviewStyle(child, style, styledClasses, applied || applyHere, styleOverrides),
		),
	};
};

const isPreviewHostNode = (node: PlaygroundNode): node is PlaygroundHostNode =>
	node !== null && typeof node === "object" && !Array.isArray(node);

const renderPlaygroundNode = (node: PlaygroundNode, key?: string): ReactNode => {
	if (node === null || typeof node === "boolean") return null;
	if (typeof node === "string" || typeof node === "number") return node;
	if (Array.isArray(node)) {
		return createElement(
			Fragment,
			key === undefined ? null : { key },
			...node.map((child, index) => renderPlaygroundNode(child, `${key ?? "child"}-${index}`)),
		);
	}
	if (!isPreviewHostNode(node)) return null;
	const hostProps: Record<string, unknown> = {};
	for (const [name, value] of Object.entries(node.props)) {
		if (name !== "children" && typeof value !== "function") hostProps[name] = value;
	}
	if (key !== undefined) hostProps.key = key;
	return createElement(
		node.type,
		hostProps,
		...node.children.map((child, index) =>
			renderPlaygroundNode(child, `${key ?? "child"}-${index}`),
		),
	);
};

function PreviewSpecimen(props: {
	preview: ExamplePreview;
	result: SuccessfulPlaygroundResult;
	tailwindStyle: Record<string, string>;
	previewControlValues: Readonly<Record<string, string>>;
	onPreviewControlChange: (id: string, value: string) => void;
}) {
	const { mode } = useTheme();
	const previewTargetRef = useRef<HTMLDivElement>(null);
	const [computedStyle, setComputedStyle] = useState<Record<string, string>>({});
	const interaction = props.preview.interaction;
	const [interactionValue, setInteractionValue] = useState(() => interaction?.initialValue ?? "");
	useEffect(() => {
		setInteractionValue(interaction?.initialValue ?? "");
	}, [interaction]);
	const isButton = props.preview.kind === PlaygroundPreviewKind.Button;
	const className = previewClassName(props.result);
	const interactionStyle =
		interaction === undefined
			? {}
			: interaction.type === "range"
				? { [interaction.property]: `${interactionValue}${interaction.unit}` }
				: { [interaction.cssVariable]: interactionValue };
	const style = {
		...(props.result.rendered === undefined
			? previewStyle(props.result, props.tailwindStyle)
			: {
					...props.result.runtimeStyle,
					...props.result.varsOutput?.style,
					...props.result.propsOutput?.style,
				}),
		...interactionStyle,
	};
	const authoredStyle: Record<string, string> = {};
	for (const [property, value] of Object.entries(style)) {
		if (typeof value === "string" || typeof value === "number") {
			authoredStyle[property] = String(value);
		}
	}
	useEffect(() => {
		const target = previewTargetRef.current?.firstElementChild;
		if (target === null || target === undefined) {
			setComputedStyle({});
			return;
		}
		const resolved = window.getComputedStyle(target);
		const next: Record<string, string> = {};
		for (const property of PREVIEW_COMPUTED_PROPERTIES) {
			const value = resolved.getPropertyValue(property);
			if (value !== "") next[property] = value;
		}
		setComputedStyle(next);
	}, [interactionValue, mode, props.previewControlValues, props.result, props.tailwindStyle]);
	const explanationStyle = { ...authoredStyle, ...computedStyle };
	const styledClasses = new Set([
		...props.result.survived,
		...props.result.styleMappings.map((mapping) => mapping.className),
	]);
	const explanationResult =
		interaction === undefined
			? props.result
			: { ...props.result, runtimeStyle: { ...props.result.runtimeStyle, ...interactionStyle } };
	const rendered =
		props.result.rendered === undefined
			? undefined
			: renderPlaygroundNode(
					withPreviewStyle(props.result.rendered, style, styledClasses, false, interactionStyle),
				);
	const fallbackClassName = `${isButton ? PREVIEW_BUTTON_RESET : ""} ${className}`.trim();
	const PreviewElement = isButton ? "button" : "div";
	const fallbackNeedsGroup = previewClassTokens(className).some((token) =>
		token.startsWith("group-hover:"),
	);
	const explanation = explainPreview({
		kind: props.preview.kind,
		result: explanationResult,
		style: explanationStyle,
		description: props.preview.description,
	});
	return (
		<div className={PREVIEW_FRAME}>
			<div
				ref={previewTargetRef}
				data-preview-kind={props.preview.kind}
				className={fallbackNeedsGroup ? "group" : undefined}
			>
				{rendered ?? (
					<PreviewElement
						className={fallbackClassName}
						style={style}
						role={props.preview.kind === PlaygroundPreviewKind.Alert ? "alert" : undefined}
						type={isButton ? "button" : undefined}
					>
						<span className={PREVIEW_COPY}>
							<strong>{props.preview.label}</strong>
							<span className={PREVIEW_DESCRIPTION}>{props.preview.description}</span>
						</span>
					</PreviewElement>
				)}
			</div>
			{interaction !== undefined && (
				<label className={PREVIEW_INTERACTION}>
					<span>{interaction.label}</span>
					{interaction.type === "color" ? (
						<input
							className={PREVIEW_INTERACTION_CONTROL}
							type="color"
							aria-label={interaction.label}
							value={interactionValue}
							onChange={(event) => setInteractionValue(event.target.value)}
						/>
					) : interaction.type === "select" ? (
						<select
							className={PREVIEW_INTERACTION_CONTROL}
							aria-label={interaction.label}
							value={interactionValue}
							onChange={(event) => setInteractionValue(event.target.value)}
						>
							{interaction.options.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					) : (
						<input
							className={PREVIEW_INTERACTION_CONTROL}
							type="range"
							aria-label={interaction.label}
							min={interaction.min}
							max={interaction.max}
							step={interaction.step}
							value={interactionValue}
							onChange={(event) => setInteractionValue(event.target.value)}
						/>
					)}
					<output className={PREVIEW_INTERACTION_VALUE} aria-live="polite">
						{interaction.type === "range"
							? `${interactionValue}${interaction.unit}`
							: interactionValue}
					</output>
					<span>{interaction.description}</span>
				</label>
			)}
			{props.preview.controls !== undefined && props.preview.controls.length > 0 && (
				<div className={PREVIEW_CONTROLS} data-preview-controls>
					{props.preview.controls.map((control) => {
						const value = props.previewControlValues[control.id] ?? control.initialValue;
						return (
							<label key={control.id} className={PREVIEW_CONTROL_LABEL}>
								<span>{control.label}</span>
								<select
									className={PREVIEW_INTERACTION_CONTROL}
									aria-label={control.label}
									data-preview-control={control.id}
									value={value}
									onChange={(event) => props.onPreviewControlChange(control.id, event.target.value)}
								>
									{control.options.map((option) => (
										<option key={option.value} value={option.value}>
											{option.label}
										</option>
									))}
								</select>
							</label>
						);
					})}
					<span className={PREVIEW_CONTROL_DESCRIPTION} data-preview-control-description>
						{props.preview.controls.map((control) => control.description).join(" ")}
					</span>
				</div>
			)}
			{explanation !== undefined && (
				<span className={uiCss.class({ fontSize: "10px", color: "textFaint" })}>{explanation}</span>
			)}
		</div>
	);
}

function LivePreviewSection(props: {
	preview: ExamplePreview;
	result: SuccessfulPlaygroundResult;
	previewControlValues: Readonly<Record<string, string>>;
	onPreviewControlChange: (id: string, value: string) => void;
}) {
	const generatedCss = props.result.sheets.map((sheet) => sheet.css).join("\n");
	const className = previewClassName(props.result);
	const tailwindPreview = useTailwindPreview(className, previewClassNames(props.result));
	return (
		<Pane
			label="Live preview"
			right={
				<span
					className={uiCss.class({
						marginRight: "4px",
						border: "strong",
						borderRadius: "4px",
						padding: "2px 6px",
						fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
						fontSize: "10px",
						color: "success",
					})}
				>
					{props.result.rendered === undefined ? "fallback" : "rendered"}
				</span>
			}
			className={uiCss.class({ height: "100%" })}
		>
			{(generatedCss !== "" || tailwindPreview.css !== "") && (
				<style data-playground-preview>
					{[generatedCss, tailwindPreview.css].filter(Boolean).join("\n")}
				</style>
			)}
			<div className={PREVIEW_STAGE}>
				<PreviewSpecimen
					preview={props.preview}
					result={props.result}
					tailwindStyle={tailwindPreview.style}
					previewControlValues={props.previewControlValues}
					onPreviewControlChange={props.onPreviewControlChange}
				/>
			</div>
		</Pane>
	);
}

function TokenPill(props: { token: string; killed: boolean }) {
	return (
		<span
			className={`${uiCss.class({ borderRadius: "4px", border: "1px solid", padding: "2px 6px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "11.5px", lineHeight: "16px" })} ${props.killed ? uiCss.class({ borderColor: "borderStrong", backgroundColor: "controlHover", color: "danger", textDecoration: "line-through", textDecorationColor: "danger" }) : uiCss.class({ borderColor: "borderStrong", backgroundColor: "controlHover", color: "success" })}`}
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
						color: "textFaint",
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
						color: "textFaint",
					})}
				>
					<span className={uiCss.class({ color: "success" })}>{survived.length} kept</span>
					{killed.length > 0 && (
						<>
							{" · "}
							<span className={uiCss.class({ color: "danger" })}>{killed.length} dropped</span>
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
			<div className={uiCss.class({ "& > * + *": { borderTop: "hairline" } })}>
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
								color: "accentText",
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
								color: "textMuted",
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
						color: "textMuted",
					})}
				>
					{props.mappings.length} {props.mappings.length === 1 ? "declaration" : "declarations"}
				</span>
			}
		>
			<div
				className={uiCss.class({
					"& > * + *": { borderTop: "hairline" },
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
							<span className={uiCss.class({ color: "warning" })}>{mapping.property}</span>
							<span className={uiCss.class({ color: "text" })}>: {mapping.value}</span>
							<span className={uiCss.class({ color: "textSoft" })}>
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
								color: "textMuted",
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
	borderLeft: "hairline",
	"@media (max-width: 760px)": { borderTop: "hairline", borderLeft: "0" },
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
	color: "textMuted",
	"&:hover": { color: "textStrong" },
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
	color: "textSoft",
	"&:hover": { backgroundColor: "controlHover", color: "textStrong" },
});
const IR_NODE_SELECTED = uiCss.class({
	backgroundColor: "accentSoft",
	color: "accentText",
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
	color: "textFaint",
});
const IR_DETAIL_HEADER = uiCss.class({
	display: "flex",
	minWidth: "0px",
	flexDirection: "column",
	gap: "4px",
	borderBottom: "hairline",
	padding: "10px 12px",
});
const IR_DETAIL_KICKER = uiCss.class({
	fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
	fontSize: "9px",
	textTransform: "uppercase",
	letterSpacing: "0.1em",
	color: "textFaint",
});
const IR_DETAIL_PATH = uiCss.class({
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
	fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
	fontSize: "11px",
	color: "accentText",
});
const IR_RAW = uiCss.class({ flexShrink: "0", borderTop: "hairline" });
const IR_RAW_SUMMARY = uiCss.class({
	cursor: "pointer",
	padding: "9px 12px",
	fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
	fontSize: "10.5px",
	color: "textMuted",
	"&:hover": { color: "textStrong" },
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
			<div {...uiCss.props(IR_ROW, uiCss.vars({ paddingLeft: `${props.depth * 14}px` }))}>
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
						color: "textMuted",
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
			collapsible
			className={uiCss.class({ borderColor: "danger" })}
			right={
				<span
					className={uiCss.class({
						marginRight: "4px",
						fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
						fontSize: "10.5px",
						color: "danger",
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
					color: "danger",
				})}
			>
				{props.error}
			</pre>
		</Pane>
	);
}

export function ResultsPane(props: {
	result: PlaygroundResult;
	previewResult: PlaygroundResult;
	preview: ExamplePreview;
	previewControlValues: Readonly<Record<string, string>>;
	onPreviewControlChange: (id: string, value: string) => void;
}) {
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
	const previewResult = props.previewResult.ok ? props.previewResult : r;
	const classString = previewClassNames(r);
	const panels: ResizableSplitterPanel[] = [
		{
			id: "live-preview",
			initialSize: 38,
			collapsible: true,
			content: (
				<LivePreviewSection
					preview={props.preview}
					result={previewResult}
					previewControlValues={props.previewControlValues}
					onPreviewControlChange={props.onPreviewControlChange}
				/>
			),
		},
		{
			id: "execution-evidence",
			initialSize: 12,
			minExpandedSize: 16,
			collapsible: true,
			initiallyCollapsed: true,
			content: <ExecutionEvidenceSection evidence={r.execution} />,
		},
	];
	if (classString.trim() !== "") {
		panels.push({
			id: "class-string",
			initialSize: 14,
			collapsible: true,
			content: (
				<Pane
					label="Class string"
					className={uiCss.class({ height: "100%" })}
					right={<CopyButton text={classString} />}
				>
					<Snippet code={classString} lang="css" />
				</Pane>
			),
		});
	}
	panels.push({
		id: "build-time-fold",
		initialSize: 11,
		minExpandedSize: 14,
		collapsible: true,
		initiallyCollapsed: true,
		content: <FoldSection fold={r.fold} note={r.foldNote} />,
	});
	if (r.survived.length > 0 || r.killed.length > 0) {
		panels.push({
			id: "tokens",
			initialSize: 13,
			minExpandedSize: 16,
			collapsible: true,
			initiallyCollapsed: true,
			content: <TokensSection survived={r.survived} killed={r.killed} />,
		});
	}
	if (r.atomDeclarations.length > 0) {
		panels.push({
			id: "css-atoms",
			initialSize: 15,
			minExpandedSize: 20,
			collapsible: true,
			initiallyCollapsed: true,
			content: <AtomsSection atoms={r.atomDeclarations} />,
		});
	}
	if (r.styleMappings.length > 0) {
		panels.push({
			id: "declarations-to-classes",
			initialSize: 18,
			minExpandedSize: 24,
			collapsible: true,
			initiallyCollapsed: true,
			content: <StyleMappingsSection mappings={r.styleMappings} />,
		});
	}
	for (const [index, sheet] of r.sheets.entries()) {
		if (sheet.css.trim() === "" && sheet.tokens.trim() === "" && sheet.rules.length === 0) {
			continue;
		}
		panels.push({
			id: `generated-css-${index + 1}`,
			initialSize: 10,
			minExpandedSize: 28,
			collapsible: true,
			initiallyCollapsed: true,
			content: <SheetSection sheets={[sheet]} />,
		});
	}
	if (r.programs.length > 0) {
		panels.push({
			id: "styleprogram-ir",
			initialSize: 20,
			minExpandedSize: 32,
			collapsible: true,
			initiallyCollapsed: true,
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
