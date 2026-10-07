import type { ReactNode } from "react";
import { Badge, Card, EmptyState, type PanelSnapshot } from "./shared.tsx";

export interface InspectorPanelProps {
	readonly data: PanelSnapshot;
}

const PICK_HINT =
	"Choose Inspect styles (the cursor icon in the Vite DevTools dock), then click an element in your app. Press Escape to cancel.";

export function InspectorPanel({ data }: InspectorPanelProps): ReactNode {
	const selected = data.selected;
	const selection = selected ? (
		<>
			<div className="selection-grid">
				<div>
					<span className="field-label">Element</span>
					<code>{selected.tagName ?? "unknown"}</code>
				</div>
				<div>
					<span className="field-label">Classes</span>
					<strong>{selected.classNames.length}</strong>
				</div>
				<div>
					<span className="field-label">CSS rules</span>
					<strong>{selected.classRules.length}</strong>
				</div>
				<div>
					<span className="field-label">Programs</span>
					<strong>{selected.matchedPrograms.length}</strong>
				</div>
			</div>
			<div className="chip-row">
				{selected.classNames.map((name) => (
					<span className="chip" key={`class-${name}`}>
						.{name}
					</span>
				))}
				{Object.entries(selected.attributes)
					.filter(([key]) => key !== "class")
					.map(([key, value]) => (
						<span className="chip" key={`attribute-${key}`}>
							<b>{key}</b> {value}
						</span>
					))}
			</div>
		</>
	) : (
		<EmptyState title="Nothing selected" detail={PICK_HINT} />
	);

	const rules =
		selected && selected.classRules.length > 0 ? (
			<div className="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Class</th>
							<th>Condition</th>
							<th>Declarations</th>
						</tr>
					</thead>
					<tbody>
						{selected.classRules.map((rule, index) => (
							<tr key={`${rule.className}-${index}`}>
								<td>
									<code>.{rule.className}</code>
								</td>
								<td>
									{[
										...rule.conditions,
										rule.selector.replace(`.${CSS.escape(rule.className)}`, "").trim(),
									]
										.filter(Boolean)
										.join(" ") || <span className="muted">always</span>}
								</td>
								<td>
									<code>{rule.declarations}</code>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		) : (
			<EmptyState
				title={selected ? "No stylesheet rules for these classes" : "No element yet"}
				detail={
					selected
						? "None of the element's classes appear in a readable stylesheet on this page."
						: "Each class of the picked element is listed with the rules it produces, including media queries and states."
				}
			/>
		);

	const computed =
		selected && Object.keys(selected.computedStyles).length > 0 ? (
			<div className="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Computed property</th>
							<th>Value</th>
						</tr>
					</thead>
					<tbody>
						{Object.entries(selected.computedStyles).map(([property, value]) => (
							<tr key={property}>
								<td>
									<code>{property}</code>
								</td>
								<td>{value}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		) : (
			<EmptyState
				title="No computed style sample"
				detail="The picker captures the selected element's relevant computed properties."
			/>
		);

	const recent = data.stylePrograms.slice(0, 6).map((program) => {
		const declarations = program.program.rules.reduce(
			(count, rule) => count + rule.declarations.length,
			0,
		);
		return (
			<div className="list-row" key={program.id}>
				<div>
					<strong>{program.label ?? program.id}</strong>
					<small>{program.file ?? "generated evidence"}</small>
				</div>
				<Badge label={`${declarations} declarations`} tone="good" />
			</div>
		);
	});

	return (
		<>
			<Card title="Element inspector" eyebrow="LIVE SELECTION" className="hero-card">
				{selection}
			</Card>
			<Card title="Classes → CSS rules" eyebrow="STYLESHEET EVIDENCE" className="wide-card">
				{rules}
			</Card>
			<Card title="Computed style sample" eyebrow="BROWSER EVIDENCE" className="wide-card">
				{computed}
			</Card>
			<Card title="Recent style programs" eyebrow="STYLEPROGRAM IR">
				{recent.length > 0 ? (
					recent
				) : (
					<EmptyState
						title="No programs yet"
						detail="Run a migration preview or use a YumCSS compiler integration to populate style evidence."
					/>
				)}
			</Card>
		</>
	);
}
