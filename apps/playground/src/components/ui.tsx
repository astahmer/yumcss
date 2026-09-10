import {
	createContext,
	Fragment,
	useContext,
	useEffect,
	useId,
	useRef,
	useState,
	type ReactNode,
} from "react";
import { Splitter } from "@ark-ui/react/splitter";
import { useSplitter } from "@ark-ui/react";
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
		backgroundColor: "var(--pw-border-strong)",
		content: '""',
		transform: "translateY(-50%)",
		transition: "background-color 120ms, height 120ms",
	},
	"&:hover::after, &:focus-visible::after": {
		height: "52px",
		backgroundColor: "var(--pw-accent)",
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
		backgroundColor: "var(--pw-border-strong)",
		content: '""',
		transform: "translateX(-50%)",
		transition: "background-color 120ms, width 120ms",
	},
	"&:hover::after, &:focus-visible::after": {
		width: "52px",
		backgroundColor: "var(--pw-accent)",
	},
});

export interface ResizableSplitterPanel {
	id: string;
	content: ReactNode;
	initialSize?: number;
	maxSize?: number;
	collapsible?: boolean;
	collapsedSize?: number | string;
	initiallyCollapsed?: boolean;
}

interface ResizableSplitterControls {
	collapsed: boolean;
	toggle: () => void;
}

const RESIZABLE_SPLITTER_CONTROLS = createContext<ResizableSplitterControls | null>(null);
const DEFAULT_COLLAPSED_SIZE = "36px";

const initialPanelSizes = (panels: readonly ResizableSplitterPanel[]): number[] => {
	const sizes = panels.map((panel) => panel.initialSize ?? 100 / Math.max(panels.length, 1));
	const total = sizes.reduce((sum, size) => sum + size, 0);
	return total === 0 ? sizes : sizes.map((size) => (size / total) * 100);
};

/** Ark-backed split layout used for the playground's inspectable panes. */
export function ResizableSplitter(props: {
	orientation: "horizontal" | "vertical";
	panels: readonly ResizableSplitterPanel[];
	className?: string;
}) {
	const panelSignature = props.panels.map((panel) => panel.id).join("\u0000");
	const initialCollapsedPanelIds = () =>
		new Set(
			props.panels.filter((panel) => panel.initiallyCollapsed === true).map((panel) => panel.id),
		);
	const [collapsedPanelIds, setCollapsedPanelIds] =
		useState<ReadonlySet<string>>(initialCollapsedPanelIds);
	const previousPanelSignature = useRef<string | undefined>(undefined);

	const splitter = useSplitter({
		orientation: props.orientation,
		panels: props.panels.map(({ id, maxSize, collapsible, collapsedSize }) => ({
			id,
			maxSize,
			collapsible,
			collapsedSize: collapsedSize ?? DEFAULT_COLLAPSED_SIZE,
		})),
		defaultSize: initialPanelSizes(props.panels),
	});
	useEffect(() => {
		if (previousPanelSignature.current === panelSignature) return;
		previousPanelSignature.current = panelSignature;
		const nextCollapsedPanelIds = initialCollapsedPanelIds();
		setCollapsedPanelIds(nextCollapsedPanelIds);
		let collapseFrame = 0;
		const resetFrame = requestAnimationFrame(() => {
			splitter.resetSizes();
			collapseFrame = requestAnimationFrame(() => {
				for (const panelId of nextCollapsedPanelIds) splitter.collapsePanel(panelId);
			});
		});
		return () => {
			cancelAnimationFrame(resetFrame);
			if (collapseFrame !== 0) cancelAnimationFrame(collapseFrame);
		};
	}, [panelSignature]);
	const togglePanel = (panelId: string): void => {
		const panel = props.panels.find((candidate) => candidate.id === panelId);
		if (panel === undefined || panel.collapsible !== true) return;
		const currentCollapsed = collapsedPanelIds.has(panelId);
		if (currentCollapsed) splitter.expandPanel(panelId);
		else splitter.collapsePanel(panelId);
		setCollapsedPanelIds((current) => {
			const next = new Set(current);
			if (currentCollapsed) next.delete(panelId);
			else next.add(panelId);
			return next;
		});
	};
	return (
		<Splitter.RootProvider
			value={splitter}
			className={`${props.orientation === "horizontal" ? SPLITTER_ROOT_HORIZONTAL : SPLITTER_ROOT_VERTICAL} ${props.className ?? ""}`}
		>
			{props.panels.map((panel, index) => (
				<Fragment key={panel.id}>
					<Splitter.Panel id={panel.id} className={SPLITTER_PANEL}>
						<RESIZABLE_SPLITTER_CONTROLS.Provider
							value={
								panel.collapsible === true
									? {
											collapsed: collapsedPanelIds.has(panel.id),
											toggle: () => togglePanel(panel.id),
										}
									: null
							}
						>
							<div className={SPLITTER_PANEL_CONTENT}>{panel.content}</div>
						</RESIZABLE_SPLITTER_CONTROLS.Provider>
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
		</Splitter.RootProvider>
	);
}

const PANE_TOGGLE = uiCss.class({
	display: "flex",
	minWidth: "0px",
	alignItems: "center",
	gap: "7px",
	border: "0",
	backgroundColor: "transparent",
	padding: "0",
	fontSize: "11px",
	fontWeight: "500",
	textTransform: "uppercase",
	letterSpacing: "0.09em",
	color: "var(--pw-text-muted)",
	textAlign: "left",
	"&:hover": { color: "var(--pw-text-strong)" },
	"&:focus-visible": { outline: "1px solid var(--pw-accent)", outlineOffset: "3px" },
});
const PANE_TOGGLE_ICON = uiCss.class({ color: "var(--pw-text-faint)", fontSize: "12px" });

/** Shared pane chrome: hairline border, flat surface, small-caps header. */
export function Pane(props: {
	label: string;
	right?: ReactNode;
	children: ReactNode;
	className?: string;
	collapsible?: boolean;
}) {
	const splitterControls = useContext(RESIZABLE_SPLITTER_CONTROLS);
	const [open, setOpen] = useState(true);
	const collapsible = props.collapsible === true || splitterControls !== null;
	const collapsed = splitterControls?.collapsed ?? (collapsible && !open);
	const contentId = useId();
	const toggle = () => {
		if (splitterControls !== null) splitterControls.toggle();
		else setOpen((current) => !current);
	};
	return (
		<section
			className={`${uiCss.class({ display: "flex", minHeight: "0px", flexDirection: "column", overflow: "hidden", border: "1px solid var(--pw-border)", borderRadius: "8px", backgroundColor: "var(--pw-surface)" })} ${props.className ?? ""}`}
		>
			<header
				className={uiCss.class({
					display: "flex",
					minWidth: "0px",
					height: "36px",
					flexShrink: "0",
					alignItems: "center",
					justifyContent: "space-between",
					gap: "8px",
					borderBottom: "1px solid var(--pw-border)",
					paddingLeft: "12px",
					paddingRight: "8px",
				})}
			>
				{collapsible ? (
					<button
						type="button"
						className={PANE_TOGGLE}
						aria-expanded={!collapsed}
						aria-controls={contentId}
						onClick={toggle}
					>
						<span aria-hidden="true" className={PANE_TOGGLE_ICON}>
							{collapsed ? "▸" : "▾"}
						</span>
						<span>{props.label}</span>
					</button>
				) : (
					<h2
						className={uiCss.class({
							minWidth: "0px",
							margin: "0",
							overflow: "hidden",
							fontSize: "11px",
							fontWeight: "500",
							textTransform: "uppercase",
							letterSpacing: "0.09em",
							color: "var(--pw-text-muted)",
						})}
					>
						{props.label}
					</h2>
				)}
				{props.right}
			</header>
			<div
				id={contentId}
				hidden={collapsed}
				className={uiCss.class({ minHeight: "0px", flex: "1 1 0%", overflow: "auto" })}
			>
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
				border: "1px solid var(--pw-border-strong)",
				borderRadius: "4px",
				backgroundColor: "var(--pw-control-hover)",
				padding: "2px 6px",
				fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
				fontSize: "10px",
				lineHeight: "1",
				color: "var(--pw-text-soft)",
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
			className={`${uiCss.class({ flexShrink: "0", borderRadius: "4px", padding: "4px 8px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "11px", lineHeight: "1", transition: "color 120ms, background-color 120ms", "&:focus-visible": { outline: "1px solid var(--pw-accent)" } })} ${props.active === true ? uiCss.class({ color: "var(--pw-success)" }) : uiCss.class({ color: "var(--pw-text-soft)", "&:hover": { backgroundColor: "var(--pw-control-hover)", color: "var(--pw-text-strong)" } })}`}
		>
			{props.children}
		</button>
	);
}
