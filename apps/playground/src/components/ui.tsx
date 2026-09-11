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
		backgroundColor: "borderStrong",
		content: '""',
		transform: "translateY(-50%)",
		transition: "background-color 120ms, height 120ms",
	},
	"&:hover::after, &:focus-visible::after": {
		height: "52px",
		backgroundColor: "accent",
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
		backgroundColor: "borderStrong",
		content: '""',
		transform: "translateX(-50%)",
		transition: "background-color 120ms, width 120ms",
	},
	"&:hover::after, &:focus-visible::after": {
		width: "52px",
		backgroundColor: "accent",
	},
});

export interface ResizableSplitterPanel {
	id: string;
	content: ReactNode;
	initialSize?: number;
	minExpandedSize?: number;
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

const collapsedPanelStyle = (panel: ResizableSplitterPanel) => {
	const size = panel.collapsedSize ?? DEFAULT_COLLAPSED_SIZE;
	return {
		flexGrow: 0,
		flexShrink: 0,
		flexBasis: typeof size === "number" ? `${size}%` : size,
	};
};

const initialPanelSizes = (panels: readonly ResizableSplitterPanel[]): number[] => {
	const sizes = panels.map((panel) => panel.initialSize ?? 100 / Math.max(panels.length, 1));
	const total = sizes.reduce((sum, size) => sum + size, 0);
	return total === 0 ? sizes : sizes.map((size) => (size / total) * 100);
};

const adjustPanelSizes = (props: {
	sizes: readonly number[];
	targetIndex: number;
	delta: number;
	donorIndices: readonly number[];
}): number[] | undefined => {
	const donorSize = props.donorIndices.reduce(
		(total, index) => total + (props.sizes[index] ?? 0),
		0,
	);
	if (props.delta === 0 || donorSize <= 0) return undefined;
	const donorIndexSet = new Set(props.donorIndices);
	return props.sizes.map((size, index) => {
		if (index === props.targetIndex) return size + props.delta;
		if (!donorIndexSet.has(index)) return size;
		return size - props.delta * (size / donorSize);
	});
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
		setCollapsedPanelIds(initialCollapsedPanelIds());
		const resetFrame = requestAnimationFrame(() => splitter.resetSizes());
		return () => cancelAnimationFrame(resetFrame);
	}, [panelSignature]);
	const togglePanel = (panelId: string): void => {
		const panel = props.panels.find((candidate) => candidate.id === panelId);
		if (panel === undefined || panel.collapsible !== true) return;
		const currentCollapsed = collapsedPanelIds.has(panelId);
		const targetIndex = props.panels.findIndex((candidate) => candidate.id === panelId);
		if (targetIndex === -1) return;
		if (panel.minExpandedSize === undefined) {
			if (currentCollapsed) splitter.expandPanel(panelId);
			else splitter.collapsePanel(panelId);
		} else if (currentCollapsed) {
			const sizes = splitter.getSizes();
			const currentSize = sizes[targetIndex] ?? 0;
			const expandedSize = Math.max(currentSize, panel.minExpandedSize);
			const donorIndices = props.panels.flatMap((candidate, index) =>
				index !== targetIndex && !collapsedPanelIds.has(candidate.id) ? [index] : [],
			);
			const nextSizes = adjustPanelSizes({
				sizes,
				targetIndex,
				delta: expandedSize - currentSize,
				donorIndices,
			});
			if (nextSizes === undefined) return;
			splitter.setSizes(nextSizes);
		} else {
			const sizes = splitter.getSizes();
			const currentSize = sizes[targetIndex] ?? 0;
			splitter.collapsePanel(panelId);
			const collapsedSize = splitter.getPanelSize(panelId);
			const donorIndices = props.panels.flatMap((candidate, index) =>
				index !== targetIndex && !collapsedPanelIds.has(candidate.id) ? [index] : [],
			);
			const nextSizes = adjustPanelSizes({
				sizes,
				targetIndex,
				delta: collapsedSize - currentSize,
				donorIndices,
			});
			if (nextSizes !== undefined) splitter.setSizes(nextSizes);
		}
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
					<Splitter.Panel
						id={panel.id}
						className={SPLITTER_PANEL}
						style={collapsedPanelIds.has(panel.id) ? collapsedPanelStyle(panel) : undefined}
					>
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
	color: "textMuted",
	textAlign: "left",
	"&:hover": { color: "textStrong" },
	"&:focus-visible": {
		outlineColor: "accent",
		outlineStyle: "solid",
		outlineWidth: "1px",
		outlineOffset: "3px",
	},
});
const PANE_TOGGLE_ICON = uiCss.class({ color: "textFaint", fontSize: "12px" });
const PANE_IN_SPLITTER = uiCss.class({ height: "100%", flex: "1 1 0%" });

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
			data-pane={props.label}
			className={`${uiCss.class({ display: "flex", minHeight: "0px", flexDirection: "column", overflow: "hidden", border: "hairline", borderRadius: "8px", backgroundColor: "surface" })} ${splitterControls === null ? "" : PANE_IN_SPLITTER} ${props.className ?? ""}`}
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
					borderBottom: "hairline",
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
							color: "textMuted",
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
				border: "strong",
				borderRadius: "4px",
				backgroundColor: "controlHover",
				padding: "2px 6px",
				fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
				fontSize: "10px",
				lineHeight: "1",
				color: "textSoft",
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
			className={`${uiCss.class({ flexShrink: "0", borderRadius: "4px", padding: "4px 8px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "11px", lineHeight: "1", transition: "color 120ms, background-color 120ms", "&:focus-visible": { outlineColor: "accent", outlineStyle: "solid", outlineWidth: "1px" } })} ${props.active === true ? uiCss.class({ color: "success" }) : uiCss.class({ color: "textSoft", "&:hover": { backgroundColor: "controlHover", color: "textStrong" } })}`}
		>
			{props.children}
		</button>
	);
}
