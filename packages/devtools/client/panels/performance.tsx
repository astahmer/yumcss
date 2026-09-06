import type { ReactNode } from "react";
import { Card, EmptyState, shortPath, type PanelSnapshot } from "./shared.tsx";

export interface PerformancePanelProps {
	readonly data: PanelSnapshot;
}

export function PerformancePanel({ data }: PerformancePanelProps): ReactNode {
	const totalBytes = data.transforms.reduce((sum, item) => sum + item.bytes, 0);
	const totalMs = data.transforms.reduce((sum, item) => sum + item.durationMs, 0);

	return (
		<Card title="Build & runtime performance" eyebrow="DEV SERVER EVIDENCE" className="wide-card">
			<div className="metric-strip">
				<div>
					<span>Modules</span>
					<strong>{data.transforms.length}</strong>
				</div>
				<div>
					<span>Source bytes</span>
					<strong>{totalBytes.toLocaleString()}</strong>
				</div>
				<div>
					<span>Scan time</span>
					<strong>{totalMs.toFixed(1)} ms</strong>
				</div>
				<div>
					<span>HMR events</span>
					<strong>{data.runtime.filter((event) => event.event === "hmr-update").length}</strong>
				</div>
			</div>
			{data.transforms.length > 0 ? (
				<div className="table-wrap">
					<table>
						<thead>
							<tr>
								<th>Module</th>
								<th>Size</th>
								<th>Transform</th>
								<th>Runs</th>
							</tr>
						</thead>
						<tbody>
							{data.transforms.map((item) => (
								<tr key={item.file}>
									<td>
										<code>{shortPath(item.file)}</code>
									</td>
									<td>{item.bytes.toLocaleString()} B</td>
									<td>{item.durationMs.toFixed(2)} ms</td>
									<td>{item.transformCount}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<EmptyState
					title="No module timings"
					detail="Edit a source file or start the Vite app to collect timings."
				/>
			)}
		</Card>
	);
}
