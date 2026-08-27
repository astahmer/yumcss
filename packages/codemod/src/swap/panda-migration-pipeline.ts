import type { PandaMigrateOptions, PandaMigrateReport } from "./panda-migrate.ts";
import { runPandaMigration } from "./panda-migrate.ts";
import {
	discoverPandaMigration,
	extractPandaMigrationUsage,
	loadPandaMigrationTheme,
	scanPandaMigrationSources,
	type PandaMigrationWorkspace,
} from "./panda-migration-discovery.ts";

/** Scoped Panda migration domain; concrete parsing/emission modules stay replaceable. */
export const PANDA_MIGRATION_PIPELINE_SCHEMA = "pandwind.panda-migration-pipeline/2" as const;

export type PandaMigrationPhase =
	| "discovery"
	| "conversion"
	| "emission"
	| "rewrite"
	| "validation";

export interface PandaMigrationContext {
	readonly options: PandaMigrateOptions;
	readonly workspace?: PandaMigrationWorkspace;
	readonly report?: PandaMigrateReport;
	readonly completedStages: readonly string[];
}

export interface PandaMigrationStageResult {
	readonly workspace?: PandaMigrationWorkspace;
	readonly report?: PandaMigrateReport;
	readonly notes?: readonly string[];
}

export interface PandaMigrationStage {
	readonly id: string;
	readonly phase: PandaMigrationPhase;
	run(context: PandaMigrationContext): Promise<PandaMigrationStageResult>;
}

export interface PandaMigrationPipeline {
	readonly schema: typeof PANDA_MIGRATION_PIPELINE_SCHEMA;
	readonly stages: readonly PandaMigrationStage[];
	run(options: PandaMigrateOptions): Promise<PandaMigrateReport>;
}

export function createPandaMigrationPipeline(
	stages: readonly PandaMigrationStage[] = [
		{
			id: "project-discovery",
			phase: "discovery",
			async run({ options }) {
				return { workspace: await discoverPandaMigration(options) };
			},
		},
		{
			id: "theme-config",
			phase: "discovery",
			async run({ options, workspace }) {
				if (workspace === undefined) throw new Error("theme-config requires project discovery");
				const theme = await loadPandaMigrationTheme(options.projectRoot);
				return {
					workspace: { ...workspace, theme },
					notes: [`theme/config stage loaded ${theme.tokenVars.size} token variable(s)`],
				};
			},
		},
		{
			id: "source-scanning",
			phase: "discovery",
			async run({ workspace }) {
				if (workspace === undefined) throw new Error("source-scanning requires project discovery");
				const sources = scanPandaMigrationSources(workspace.files);
				return {
					workspace: { ...workspace, sources },
					notes: [`source scanner indexed ${sources.length} document(s)`],
				};
			},
		},
		{
			id: "recipe-pattern-extraction",
			phase: "conversion",
			async run({ workspace }) {
				if (workspace === undefined)
					throw new Error("recipe extraction requires project discovery");
				const usage = extractPandaMigrationUsage(workspace.files);
				return {
					workspace: { ...workspace, usage },
					notes: [`usage extractor found ${usage.recipes.size} recipe binding(s)`],
				};
			},
		},
		{
			id: "semantic-conversion",
			phase: "conversion",
			async run({ workspace }) {
				if (workspace === undefined)
					throw new Error("semantic conversion requires project discovery");
				return { workspace, notes: ["semantic conversion stage prepared replaceable IR helpers"] };
			},
		},
		{
			id: "module-emission",
			phase: "emission",
			async run({ workspace }) {
				if (workspace === undefined) throw new Error("module emission requires project discovery");
				return { workspace, notes: ["module emission stage delegated to the project emitter"] };
			},
		},
		{
			id: "rewrite-application",
			phase: "rewrite",
			async run({ workspace }) {
				if (workspace === undefined) throw new Error("rewrite stage requires project discovery");
				return { workspace, notes: ["rewrite stage delegated to the lossless edit applicator"] };
			},
		},
		{
			id: "validation-reporting",
			phase: "validation",
			async run({ options, workspace, completedStages }) {
				const report = await runPandaMigration({ ...options, workspace });
				return {
					report: {
						...report,
						notes: [
							...report.notes,
							`pipeline stages: ${[...completedStages, "validation-reporting"].join(" -> ")}`,
						],
					},
				};
			},
		},
	],
): PandaMigrationPipeline {
	return {
		schema: PANDA_MIGRATION_PIPELINE_SCHEMA,
		stages,
		async run(options) {
			let context: PandaMigrationContext = { options, completedStages: [] };
			for (const stage of stages) {
				// Stages are sequential by contract: each stage consumes prior context.
				// oxlint-disable-next-line no-await-in-loop
				const result = await stage.run(context);
				context = {
					...context,
					...result,
					completedStages: [...context.completedStages, stage.id],
				};
			}
			if (context.report === undefined)
				throw new Error("Panda migration pipeline produced no report");
			return context.report;
		},
	};
}

export const PANDA_MIGRATION_PIPELINE = createPandaMigrationPipeline();
