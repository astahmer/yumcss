import type { ReactNode } from "react";
import { css as uiCss } from "../ui-css.ts";

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
			<header className={uiCss.class({ display: "flex", height: "36px", flexShrink: "0", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.07)", paddingLeft: "12px", paddingRight: "8px" })}>
				<h2 className={uiCss.class({ margin: "0", fontSize: "11px", fontWeight: "500", textTransform: "uppercase", letterSpacing: "0.09em", color: "#71717a" })}>
					{props.label}
				</h2>
				{props.right}
			</header>
			<div className={uiCss.class({ minHeight: "0px", flex: "1 1 0%", overflow: "auto" })}>{props.children}</div>
		</section>
	);
}

/** Keyboard key cap. */
export function Kbd(props: { children: ReactNode }) {
	return (
		<kbd className={uiCss.class({ border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", backgroundColor: "rgba(255,255,255,0.04)", padding: "2px 6px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "10px", lineHeight: "1", color: "#a1a1aa" })}>
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
