import type { ReactNode } from "react";
import { Badge, Card, EmptyState, type PanelSnapshot } from "./shared.tsx";

export interface DiagnosticsPanelProps {
	readonly data: PanelSnapshot;
}

export function DiagnosticsPanel({ data }: DiagnosticsPanelProps): ReactNode {
	const diagnostics = data.diagnostics.map((diagnostic, index) => (
		<div className="diagnostic-row" key={`${diagnostic.source}-${diagnostic.message}-${index}`}>
			<span className={`severity severity-${diagnostic.severity}`} />
			<div>
				<strong>{diagnostic.message}</strong>
				<small>
					{diagnostic.file ?? "project"} · {diagnostic.source}
				</small>
			</div>
			<Badge
				label={diagnostic.severity}
				tone={diagnostic.severity === "error" ? "warn" : "quiet"}
			/>
		</div>
	));
	const residuals = data.migrations.flatMap((migration, index) =>
		migration.residuals > 0
			? [
					<div
						className="diagnostic-row"
						key={`migration-${migration.from}-${migration.to}-${index}`}
					>
						<span className="severity severity-warn" />
						<div>
							<strong>
								{migration.from} → {migration.to}
							</strong>
							<small>{migration.files.join(", ")}</small>
						</div>
						<Badge label={`${migration.residuals} residuals`} tone="warn" />
					</div>,
				]
			: [],
	);
	const rows = [...diagnostics, ...residuals];

	return (
		<Card title="Diagnostics & residuals" eyebrow="ACTIONABLE EVIDENCE" className="wide-card">
			{rows.length > 0 ? (
				rows
			) : (
				<EmptyState
					title="No diagnostics"
					detail="The current development session has no scanner or migration diagnostics."
				/>
			)}
		</Card>
	);
}
