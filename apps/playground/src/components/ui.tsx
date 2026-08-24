import type { ReactNode } from "react";

/** Shared pane chrome: hairline border, flat surface, small-caps header. */
export function Pane(props: {
	label: string;
	right?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	return (
		<section
			className={`flex min-h-0 flex-col overflow-hidden rounded-lg border border-white/[0.07] bg-[#0e0e11] ${props.className ?? ""}`}
		>
			<header className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.07] pl-3 pr-2">
				<h2 className="text-[11px] font-medium uppercase tracking-[0.09em] text-zinc-500">
					{props.label}
				</h2>
				{props.right}
			</header>
			<div className="min-h-0 flex-1 overflow-auto">{props.children}</div>
		</section>
	);
}

/** Keyboard key cap. */
export function Kbd(props: { children: ReactNode }) {
	return (
		<kbd className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] leading-none text-zinc-400">
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
			className={`shrink-0 rounded px-2 py-1 font-mono text-[11px] leading-none transition-colors ${
				props.active === true
					? "text-lime-300"
					: "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200"
			} focus-visible:outline focus-visible:outline-1 focus-visible:outline-orange-400/60`}
		>
			{props.children}
		</button>
	);
}
