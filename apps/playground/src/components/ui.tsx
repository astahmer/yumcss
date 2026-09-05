import { Fragment, type ReactNode } from "react";
import { Splitter } from "@ark-ui/react/splitter";
import { css as uiCss } from "../ui-css.ts";

const SPLITTER_ROOT_HORIZONTAL = uiCss.class({
	display: "flex",
	width: "100%",
	height: "100%",
	minWidth: "0px",
	minHeight: "0px",
	flexDirection: "row",
});
const SPLITTER_ROOT_VERTICAL = uiCss.class({
	display: "flex",
	width: "100%",
	height: "100%",
	minWidth: "0px",
	minHeight: "0px",
	flexDirection: "column",
});
const SPLITTER_PANEL = uiCss.class({
	display: "flex",
	minWidth: "0px",
	minHeight: "0px",
	flexDirection: "column",
	overflow: "hidden",
});
const SPLITTER_PANEL_CONTENT = uiCss.class({
	display: "flex",
	width: "100%",
	height: "100%",
	minWidth: "0px",
	minHeight: "0px",
	flexDirection: "column",
	"& > *": { height: "100%", minHeight: "0px" },
});
const SPLITTER_TRIGGER_HORIZONTAL = uiCss.class({
	position: "relative",
	zIndex: "1",
	width: "9px",
	minWidth: "9px",
	margin: "0 -4px",
	cursor: "col-resize",
	border: "0",
	backgroundColor: "transparent",
	padding: "0",
	touchAction: "none",
	"&::after": {
		position: "absolute",
		top: "50%",
		left: "3px",
		width: "3px",
		height: "36px",
		borderRadius: "9999px",
		backgroundColor: "rgba(255,255,255,0.12)",
		content: '""',
		transform: "translateY(-50%)",
		transition: "background-color 120ms, height 120ms",
	},
	"&:hover::after, &:focus-visible::after": {
		height: "52px",
		backgroundColor: "rgba(251,146,60,0.75)",
	},
});
const SPLITTER_TRIGGER_VERTICAL = uiCss.class({
	position: "relative",
	zIndex: "1",
	height: "9px",
	minHeight: "9px",
	margin: "-4px 0",
	cursor: "row-resize",
	border: "0",
	backgroundColor: "transparent",
	padding: "0",
	touchAction: "none",
	"&::after": {
		position: "absolute",
		top: "3px",
		left: "50%",
		width: "36px",
		height: "3px",
		borderRadius: "9999px",
		backgroundColor: "rgba(255,255,255,0.12)",
		content: '""',
		transform: "translateX(-50%)",
		transition: "background-color 120ms, width 120ms",
	},
	"&:hover::after, &:focus-visible::after": {
		width: "52px",
		backgroundColor: "rgba(251,146,60,0.75)",
	},
});

export interface ResizableSplitterPanel {
	id: string;
	content: ReactNode;
	initialSize?: number;
	minSize?: number;
	maxSize?: number;
}

/** Ark-backed split layout used for the playground's inspectable panes. */
export function ResizableSplitter(props: {
	orientation: "horizontal" | "vertical";
	panels: readonly ResizableSplitterPanel[];
	className?: string;
}) {
	const sizes = props.panels.map(
		(panel) => panel.initialSize ?? 100 / Math.max(props.panels.length, 1),
	);
	return (
		<Splitter.Root
			orientation={props.orientation}
			panels={props.panels.map(({ id, minSize, maxSize }) => ({ id, minSize, maxSize }))}
			defaultSize={sizes}
			className={`${props.orientation === "horizontal" ? SPLITTER_ROOT_HORIZONTAL : SPLITTER_ROOT_VERTICAL} ${props.className ?? ""}`}
		>
			{props.panels.map((panel, index) => (
				<Fragment key={panel.id}>
					<Splitter.Panel id={panel.id} className={SPLITTER_PANEL}>
						<div className={SPLITTER_PANEL_CONTENT}>{panel.content}</div>
					</Splitter.Panel>
					{index < props.panels.length - 1 ? (
						<Splitter.ResizeTrigger
							id={`${panel.id}:${props.panels[index + 1]!.id}`}
							className={
								props.orientation === "horizontal"
									? SPLITTER_TRIGGER_HORIZONTAL
									: SPLITTER_TRIGGER_VERTICAL
							}
							aria-label={`Resize ${panel.id} and ${props.panels[index + 1]!.id}`}
						/>
					) : null}
				</Fragment>
			))}
		</Splitter.Root>
	);
}

/** Shared pane chrome: hairline border, flat surface, small-caps header. */
export function Pane(props: {
	label: string;
	right?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	return (
		<section
			className={`${uiCss.class({ display: "flex", minHeight: "0px", flexDirection: "column", overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", backgroundColor: "#0e0e11" })} ${props.className ?? ""}`}
		>
			<header
				className={uiCss.class({
					display: "flex",
					height: "36px",
					flexShrink: "0",
					alignItems: "center",
					justifyContent: "space-between",
					borderBottom: "1px solid rgba(255,255,255,0.07)",
					paddingLeft: "12px",
					paddingRight: "8px",
				})}
			>
				<h2
					className={uiCss.class({
						margin: "0",
						fontSize: "11px",
						fontWeight: "500",
						textTransform: "uppercase",
						letterSpacing: "0.09em",
						color: "#71717a",
					})}
				>
					{props.label}
				</h2>
				{props.right}
			</header>
			<div className={uiCss.class({ minHeight: "0px", flex: "1 1 0%", overflow: "auto" })}>
				{props.children}
			</div>
		</section>
	);
}

/** Keyboard key cap. */
export function Kbd(props: { children: ReactNode }) {
	return (
		<kbd
			className={uiCss.class({
				border: "1px solid rgba(255,255,255,0.1)",
				borderRadius: "4px",
				backgroundColor: "rgba(255,255,255,0.04)",
				padding: "2px 6px",
				fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
				fontSize: "10px",
				lineHeight: "1",
				color: "#a1a1aa",
			})}
		>
			{props.children}
		</kbd>
	);
}

/** Ghost icon-ish button used for copy / reset actions. */
export function GhostButton(props: {
	onClick: () => void;
	children: ReactNode;
	active?: boolean;
	title?: string;
}) {
	return (
		<button
			type="button"
			title={props.title}
			onClick={props.onClick}
			className={`${uiCss.class({ flexShrink: "0", borderRadius: "4px", padding: "4px 8px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "11px", lineHeight: "1", transition: "color 120ms, background-color 120ms", "&:focus-visible": { outline: "1px solid rgba(251,146,60,0.6)" } })} ${props.active === true ? uiCss.class({ color: "#bef264" }) : uiCss.class({ color: "#a1a1aa", "&:hover": { backgroundColor: "rgba(255,255,255,0.06)", color: "#e4e4e7" } })}`}
		>
			{props.children}
		</button>
	);
}
