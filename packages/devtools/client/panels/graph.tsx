import type { ReactNode } from "react";
import { Card, EmptyState, shortPath, Tree, type PanelSnapshot } from "./shared.tsx";

export interface GraphPanelProps {
	readonly data: PanelSnapshot;
}

export function GraphPanel({ data }: GraphPanelProps): ReactNode {
	const rows = data.stylePrograms.map((program) => {
		const declarations = program.program.rules.reduce(
			(count, rule) => count + rule.declarations.length,
			0,
		);
		return (
			<div className="graph-row" key={program.id}>
				<div className="node node-file">{shortPath(program.file ?? "runtime")}</div>
				<span className="edge">→</span>
				<div className="node node-program">
					<b>{program.label ?? program.id}</b>
					<small>
						{program.program.rules.length} rules · {declarations} declarations
					</small>
				</div>
			</div>
		);
	});

	const trees = data.stylePrograms.map((program) => (
		<div className="ir-view" key={program.id}>
			<div className="ir-title">
				<strong>{program.label ?? program.id}</strong>
				<span>{program.file ?? "runtime"}</span>
			</div>
			<Tree value={program.program} label="StyleProgram" />
		</div>
	));

	const rawPrograms = data.stylePrograms.map((program) => (
		<details className="raw-block" key={program.id}>
			<summary>
				{program.id} <span>{program.program.rules.length} rules</span>
			</summary>
			<pre>{JSON.stringify(program.program, null, 2)}</pre>
		</details>
	));

	return (
		<>
			<Card title="Style graph" eyebrow="PROVENANCE" className="wide-card">
				{rows.length > 0 ? (
					rows
				) : (
					<EmptyState
						title="No graph edges"
						detail="Style programs appear here after a compiler or migration produces inspectable IR."
					/>
				)}
			</Card>
			<Card title="Interactive IR" eyebrow="STYLEPROGRAM TREE" className="wide-card">
				{trees.length > 0 ? (
					trees
				) : (
					<EmptyState
						title="No IR available"
						detail="The tree expands from the schema down to conditions, declarations, values, and children."
					/>
				)}
			</Card>
			<Card title="Raw JSON fallback" eyebrow="SERIALIZED IR" className="wide-card">
				{rawPrograms.length > 0 ? (
					rawPrograms
				) : (
					<EmptyState
						title="No raw IR available"
						detail="The serialized representation stays available for copying and debugging."
					/>
				)}
			</Card>
		</>
	);
}
