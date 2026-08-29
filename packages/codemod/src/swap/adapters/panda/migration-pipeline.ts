import type { PandaMigrateOptions, PandaMigrateReport } from "./panda-migrate.ts";
import type { PandaMigrationWorkspace } from "./migration-discovery.ts";
import type { PandaCall } from "./parse.ts";
import { styleProgramFromSwapIR, type StyleProgram } from "../../semantic-ir.ts";
import {
	CodemodAdapterId,
	PandaMigrationPhase,
	PandaMigrationStageId,
	PandaRewriteCandidateKind,
} from "../../identifiers.ts";
import {
	createPandaMigrationServices,
	type PandaMigrationServiceOverrides,
	type PandaMigrationServices,
} from "./pipeline-services.ts";

/** Scoped Panda migration domain; concrete parsing/emission modules stay replaceable. */
export const PANDA_MIGRATION_PIPELINE_SCHEMA = "pandwind.panda-migration-pipeline/2" as const;

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
		kind: PandaRewriteCandidateKind;
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

export interface PandaMigrationPipelineOptions {
	readonly stages?: readonly PandaMigrationStage[];
	readonly services?: PandaMigrationServiceOverrides;
}

export function createPandaMigrationPipeline(
	options: PandaMigrationPipelineOptions = {},
): PandaMigrationPipeline {
	const services: PandaMigrationServices = createPandaMigrationServices(options.services);
	const stages: readonly PandaMigrationStage[] = options.stages ?? [
		{
			id: PandaMigrationStageId.ProjectDiscovery,
			phase: PandaMigrationPhase.Discovery,
			async run({ options: migrationOptions }) {
				return { workspace: await services.discover(migrationOptions) };
			},
		},
		{
			id: PandaMigrationStageId.ThemeConfig,
			phase: PandaMigrationPhase.Discovery,
			async run({ options: migrationOptions, workspace }) {
				if (workspace === undefined) throw new Error("theme-config requires project discovery");
				const theme = await services.loadTheme(migrationOptions.projectRoot);
				return {
					workspace: { ...workspace, theme },
					notes: [`theme/config stage loaded ${theme.tokenVars.size} token variable(s)`],
				};
			},
		},
		{
			id: PandaMigrationStageId.SourceScanning,
			phase: PandaMigrationPhase.Discovery,
			async run({ workspace }) {
				if (workspace === undefined) throw new Error("source-scanning requires project discovery");
				const sources = services.scanSources(workspace.files);
				return {
					workspace: { ...workspace, sources },
					notes: [`source scanner indexed ${sources.length} document(s)`],
				};
			},
		},
		{
			id: PandaMigrationStageId.RecipePatternExtraction,
			phase: PandaMigrationPhase.Conversion,
			async run({ workspace }) {
				if (workspace === undefined)
					throw new Error("recipe extraction requires project discovery");
				const usage = services.extractUsage(workspace.files);
				return {
					workspace: { ...workspace, usage },
					notes: [`usage extractor found ${usage.recipes.size} recipe binding(s)`],
				};
			},
		},
		{
			id: PandaMigrationStageId.SemanticConversion,
			phase: PandaMigrationPhase.Conversion,
			async run({ workspace }) {
				if (workspace === undefined)
					throw new Error("semantic conversion requires project discovery");
				const calls = workspace.sources.flatMap(({ path, scan }) => {
					const file = workspace.files.find((candidate) => candidate.path === path);
					if (file === undefined) return [];
					return services.parseCalls(file.source, scan.isExcluded, { theme: workspace.theme });
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
										adapter: CodemodAdapterId.Panda,
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
			id: PandaMigrationStageId.ModuleEmission,
			phase: PandaMigrationPhase.Emission,
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
			id: PandaMigrationStageId.RewriteApplication,
			phase: PandaMigrationPhase.Rewrite,
			async run({ workspace, artifacts }) {
				if (workspace === undefined) throw new Error("rewrite stage requires project discovery");
				if (artifacts === undefined) throw new Error("rewrite stage requires module emission");
				const rewriteCandidates = workspace.sources.flatMap(({ path, scan }) => {
					const file = workspace.files.find((candidate) => candidate.path === path);
					if (file === undefined) return [];
					const calls = services.parseCalls(file.source, scan.isExcluded, {
						theme: workspace.theme,
					});
					const callCandidates = calls.map((call) => ({
						file: path,
						start: call.start,
						end: call.end,
						kind: PandaRewriteCandidateKind.StyleCall,
					}));
					const factories = services
						.scanFactoryElements(file.source, scan.isExcluded)
						.map((element) => ({
							file: path,
							start: element.start,
							end: element.openEnd,
							kind: PandaRewriteCandidateKind.FactoryElement,
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
			id: PandaMigrationStageId.ValidationReporting,
			phase: PandaMigrationPhase.Validation,
			async run({ options: migrationOptions, workspace, completedStages, artifacts }) {
				const report = await services.run({ ...migrationOptions, workspace });
				return {
					report: {
						...report,
						notes: [
							...report.notes,
							`pipeline stages: ${[...completedStages, PandaMigrationStageId.ValidationReporting].join(" -> ")}`,
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
	];
	return {
		schema: PANDA_MIGRATION_PIPELINE_SCHEMA,
		stages,
		async run(migrationOptions) {
			let context: PandaMigrationContext = { options: migrationOptions, completedStages: [] };
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
