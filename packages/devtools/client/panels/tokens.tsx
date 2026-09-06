import type { ReactNode } from "react";
import { Badge, Card, EmptyState, type PanelSnapshot } from "./shared.tsx";

export interface TokensPanelProps {
	readonly data: PanelSnapshot;
}

export function TokensPanel({ data }: TokensPanelProps): ReactNode {
	const properties = new Map<string, number>();
	for (const program of data.stylePrograms)
		for (const rule of program.program.rules)
			for (const declaration of rule.declarations)
				properties.set(declaration.property, (properties.get(declaration.property) ?? 0) + 1);

	const body =
		data.tokens.length > 0 ? (
			<div className="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Name</th>
							<th>Resolved value</th>
							<th>Kind</th>
							<th>Theme</th>
							<th>Files</th>
						</tr>
					</thead>
					<tbody>
						{data.tokens.map((token) => (
							<tr key={`${token.name}-${token.theme ?? "default"}`}>
								<td>
									<code>{token.name}</code>
								</td>
								<td>{token.value}</td>
								<td>
									<Badge label={token.kind} tone="good" />
								</td>
								<td>{token.theme ?? "default"}</td>
								<td>{token.files.length}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		) : (
			<EmptyState
				title="No generated token catalog"
				detail="Generate pandwind.interop.json to make resolved theme variables visible here."
			/>
		);

	const usage = [...properties.entries()]
		.toSorted(([, a], [, b]) => b - a)
		.slice(0, 12)
		.map(([property, count]) => (
			<div className="usage-row" key={property}>
				<code>{property}</code>
				<span className="usage-bar">
					<i style={{ width: `${Math.min(100, count * 12)}%` }} />
				</span>
				<b>{count}</b>
			</div>
		));

	return (
		<>
			<Card title="Tokens & themes" eyebrow="GENERATED ARTIFACTS" className="wide-card">
				{body}
			</Card>
			<Card title="Property usage" eyebrow="STYLEPROGRAM EVIDENCE" className="wide-card">
				{usage.length > 0 ? (
					usage
				) : (
					<EmptyState
						title="No property usage"
						detail="StyleProgram declarations will rank here as evidence arrives."
					/>
				)}
			</Card>
		</>
	);
}
