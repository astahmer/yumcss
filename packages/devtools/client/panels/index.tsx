import type { ReactNode } from "react";
import type { DevtoolsMigrationPreview } from "../../src/rpc.ts";
import type { MigrationCatalogEntry } from "./migration.tsx";
import { DiagnosticsPanel } from "./diagnostics.tsx";
import { GraphPanel } from "./graph.tsx";
import { InspectorPanel } from "./inspector.tsx";
import { MigrationPanel } from "./migration.tsx";
import { PerformancePanel } from "./performance.tsx";
import { TokensPanel } from "./tokens.tsx";
import type { PanelSnapshot } from "./shared.tsx";

export const PANEL_ID = {
	Inspector: "inspector",
	Graph: "graph",
	Tokens: "tokens",
	Migration: "migration",
	Diagnostics: "diagnostics",
	Performance: "performance",
} as const;
export type PanelId = (typeof PANEL_ID)[keyof typeof PANEL_ID];

export interface DevtoolsPanelContext {
	readonly migration?: DevtoolsMigrationPreview;
	readonly catalog: readonly MigrationCatalogEntry[];
	readonly onPreviewMigration: (form: FormData) => void;
}

export interface DevtoolsPanelProps {
	readonly snapshot: PanelSnapshot;
	readonly context: DevtoolsPanelContext;
}

export interface DevtoolsPanelDefinition {
	readonly id: PanelId;
	readonly label: string;
	readonly hint: string;
	readonly icon: string;
	render(props: DevtoolsPanelProps): ReactNode;
}

export const PANELS: readonly DevtoolsPanelDefinition[] = [
	{
		id: PANEL_ID.Inspector,
		label: "Inspector",
		hint: "selected element",
		icon: "⌁",
		render: ({ snapshot }) => <InspectorPanel data={snapshot} />,
	},
	{
		id: PANEL_ID.Graph,
		label: "Style graph",
		hint: "source → style",
		icon: "⌘",
		render: ({ snapshot }) => <GraphPanel data={snapshot} />,
	},
	{
		id: PANEL_ID.Tokens,
		label: "Tokens",
		hint: "theme evidence",
		icon: "◇",
		render: ({ snapshot }) => <TokensPanel data={snapshot} />,
	},
	{
		id: PANEL_ID.Migration,
		label: "Migration",
		hint: "preview only",
		icon: "↗",
		render: ({ snapshot, context }) => (
			<MigrationPanel
				data={snapshot}
				migration={context.migration}
				catalog={context.catalog}
				onPreview={context.onPreviewMigration}
			/>
		),
	},
	{
		id: PANEL_ID.Diagnostics,
		label: "Diagnostics",
		hint: "residuals & scans",
		icon: "!",
		render: ({ snapshot }) => <DiagnosticsPanel data={snapshot} />,
	},
	{
		id: PANEL_ID.Performance,
		label: "Performance",
		hint: "dev timings",
		icon: "◷",
		render: ({ snapshot }) => <PerformancePanel data={snapshot} />,
	},
];
