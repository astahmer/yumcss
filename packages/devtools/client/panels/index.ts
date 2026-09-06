import type { DevtoolsMigrationPreview } from "../../src/rpc.ts";
import type { PanelSnapshot } from "./shared.ts";
import { renderDiagnostics } from "./diagnostics.ts";
import { renderGraph } from "./graph.ts";
import { renderInspector } from "./inspector.ts";
import { renderMigration, type MigrationCatalogEntry } from "./migration.ts";
import { renderPerformance } from "./performance.ts";
import { renderTokens } from "./tokens.ts";

export const PANEL_ID = {
	Inspector: "inspector",
	Graph: "graph",
	Tokens: "tokens",
	Migration: "migration",
	Diagnostics: "diagnostics",
	Performance: "performance",
} as const;
export type PanelId = (typeof PANEL_ID)[keyof typeof PANEL_ID];

export interface DevtoolsPanelDefinition {
	readonly id: PanelId;
	readonly label: string;
	readonly hint: string;
	readonly icon: string;
	render(
		snapshot: PanelSnapshot,
		context: {
			readonly migration?: DevtoolsMigrationPreview;
			readonly catalog: readonly MigrationCatalogEntry[];
		},
	): string;
}

export const PANELS: readonly DevtoolsPanelDefinition[] = [
	{
		id: PANEL_ID.Inspector,
		label: "Inspector",
		hint: "selected element",
		icon: "⌁",
		render: (snapshot) => renderInspector(snapshot),
	},
	{
		id: PANEL_ID.Graph,
		label: "Style graph",
		hint: "source → style",
		icon: "⌘",
		render: (snapshot) => renderGraph(snapshot),
	},
	{
		id: PANEL_ID.Tokens,
		label: "Tokens",
		hint: "theme evidence",
		icon: "◇",
		render: (snapshot) => renderTokens(snapshot),
	},
	{
		id: PANEL_ID.Migration,
		label: "Migration",
		hint: "preview only",
		icon: "↗",
		render: (snapshot, context) => renderMigration(snapshot, context.migration, context.catalog),
	},
	{
		id: PANEL_ID.Diagnostics,
		label: "Diagnostics",
		hint: "residuals & scans",
		icon: "!",
		render: (snapshot) => renderDiagnostics(snapshot),
	},
	{
		id: PANEL_ID.Performance,
		label: "Performance",
		hint: "dev timings",
		icon: "◷",
		render: (snapshot) => renderPerformance(snapshot),
	},
];
