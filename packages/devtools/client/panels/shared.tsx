import type { ReactNode } from "react";
import type { DevtoolsEvidenceSnapshot } from "../../src/evidence/store.ts";

export type PanelSnapshot = DevtoolsEvidenceSnapshot;
export type BadgeTone = "good" | "warn" | "quiet";

export interface BadgeProps {
	readonly label: string;
	readonly tone?: BadgeTone;
}

export function Badge({ label, tone = "quiet" }: BadgeProps): ReactNode {
	return <span className={`badge badge-${tone}`}>{label}</span>;
}

export interface EmptyStateProps {
	readonly title: string;
	readonly detail: string;
}

export function EmptyState({ title, detail }: EmptyStateProps): ReactNode {
	return (
		<div className="empty-state">
			<span className="empty-mark">∅</span>
			<strong>{title}</strong>
			<p>{detail}</p>
		</div>
	);
}

export interface CardProps {
	readonly title: string;
	readonly eyebrow: string;
	readonly children: ReactNode;
	readonly className?: string;
}

export function Card({ title, eyebrow, children, className = "" }: CardProps): ReactNode {
	return (
		<section className={className === "" ? "card" : `card ${className}`}>
			<div className="card-head">
				<div>
					<span className="eyebrow">{eyebrow}</span>
					<h2>{title}</h2>
				</div>
			</div>
			{children}
		</section>
	);
}

export const shortPath = (value: string): string =>
	value.replaceAll("\\", "/").split("/").slice(-3).join("/");

export interface TreeProps {
	readonly value: unknown;
	readonly label: string;
	readonly depth?: number;
}

export function Tree({ value, label, depth = 0 }: TreeProps): ReactNode {
	if (value === null || typeof value !== "object") {
		return (
			<div className="tree-leaf">
				<span className="tree-key">{label}</span>
				<span className={`tree-value tree-${typeof value}`}>{String(value)}</span>
			</div>
		);
	}

	const entries = Array.isArray(value)
		? value.map((entry, index) => [String(index), entry] as const)
		: Object.entries(value);
	const kind = Array.isArray(value) ? `array · ${value.length}` : `object · ${entries.length}`;

	return (
		<details className="tree-node" open={depth < 2}>
			<summary>
				<span className="tree-key">{label}</span>
				<span className="tree-meta">{kind}</span>
			</summary>
			<div className="tree-children">
				{entries.map(([key, entry], index) => (
					<Tree key={`${key}-${index}`} value={entry} label={key} depth={depth + 1} />
				))}
			</div>
		</details>
	);
}
