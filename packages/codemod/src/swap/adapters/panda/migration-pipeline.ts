import type { PandaMigrateOptions, PandaMigrateReport } from "./panda-migrate.ts";
import { runPandaMigration } from "./panda-migrate.ts";
import {
	discoverPandaMigration,
	extractPandaMigrationUsage,
	loadPandaMigrationTheme,
	scanPandaMigrationSources,
	type PandaMigrationWorkspace,
} from "./migration-discovery.ts";
import { parsePandaCalls, type PandaCall } from "./parse.ts";
import { scanFactoryElements } from "./panda-migrate.ts";
import { styleProgramFromSwapIR, type StyleProgram } from "../../semantic-ir.ts";

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
	readonly artifacts?: PandaMigrationArtifacts;
}

export interface PandaMigrationArtifacts {
	readonly calls: readonly PandaCall[];
	readonly programs: readonly StyleProgram[];
	readonly modulePlans: readonly string[];
	readonly rewriteCandidates: readonly {
		file: string;
		start: number;
		end: number;
		kind: "style-call" | "factory-element";
	}[];
	readonly validationCandidates: readonly string[];
}

export interface PandaMigrationStageResult {
	readonly workspace?: PandaMigrationWorkspace;
	readonly report?: PandaMigrateReport;
	readonly notes?: readonly string[];
	readonly artifacts?: PandaMigrationArtifacts;
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
				const calls = workspace.sources.flatMap(({ path, scan }) => {
					const file = workspace.files.find((candidate) => candidate.path === path);
					if (file === undefined) return [];
					return parsePandaCalls(file.source, scan.isExcluded, { theme: workspace.theme });
				});
				const programs = calls.flatMap((call) =>
					call.ir === undefined
						? []
						: [
								styleProgramFromSwapIR(call.ir, {
									source: {
										file: "panda-migration",
										start: call.start,
										end: call.end,
										adapter: "panda",
									},
								}),
							],
				);
				const artifacts: PandaMigrationArtifacts = {
					calls,
					programs,
					modulePlans: [],
					rewriteCandidates: [],
					validationCandidates: [],
				};
				return {
					workspace,
					artifacts,
					notes: [`semantic conversion produced ${programs.length} versioned style program(s)`],
				};
			},
		},
		{
			id: "module-emission",
			phase: "emission",
			async run({ workspace, artifacts }) {
				if (workspace === undefined) throw new Error("module emission requires project discovery");
				if (artifacts === undefined)
					throw new Error("module emission requires semantic conversion");
				const modulePlans = [
					...[...workspace.usage.recipes].toSorted().map((name) => `recipes/${name}.ts`),
					...[...workspace.usage.patterns].toSorted().map((name) => `patterns/${name}.ts`),
					"css.ts",
				];
				return {
					workspace,
					artifacts: { ...artifacts, modulePlans },
					notes: [`module emission planned ${modulePlans.length} generated module(s)`],
				};
			},
		},
		{
			id: "rewrite-application",
			phase: "rewrite",
			async run({ workspace, artifacts }) {
				if (workspace === undefined) throw new Error("rewrite stage requires project discovery");
				if (artifacts === undefined) throw new Error("rewrite stage requires module emission");
				const rewriteCandidates = workspace.sources.flatMap(({ path, scan }) => {
					const file = workspace.files.find((candidate) => candidate.path === path);
					if (file === undefined) return [];
					const calls = parsePandaCalls(file.source, scan.isExcluded, { theme: workspace.theme });
					const callCandidates = calls.map((call) => ({
						file: path,
						start: call.start,
						end: call.end,
						kind: "style-call" as const,
					}));
					const factories = scanFactoryElements(file.source, scan.isExcluded).map((element) => ({
						file: path,
						start: element.start,
						end: element.openEnd,
						kind: "factory-element" as const,
					}));
					return [...callCandidates, ...factories];
				});
				return {
					workspace,
					artifacts: { ...artifacts, rewriteCandidates },
					notes: [`rewrite stage indexed ${rewriteCandidates.length} actionable candidate(s)`],
				};
			},
		},
		{
			id: "validation-reporting",
			phase: "validation",
			async run({ options, workspace, completedStages, artifacts }) {
				const report = await runPandaMigration({ ...options, workspace });
				return {
					report: {
						...report,
						notes: [
							...report.notes,
							`pipeline stages: ${[...completedStages, "validation-reporting"].join(" -> ")}`,
							...(artifacts === undefined
								? []
								: [
										`pipeline artifacts: ${artifacts.programs.length} programs, ${artifacts.modulePlans.length} modules, ${artifacts.rewriteCandidates.length} rewrites`,
									]),
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
