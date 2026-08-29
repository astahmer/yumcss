import { styleProgramFromSwapIR } from "../../semantic-ir.ts";
import {
	CodemodAdapterId,
	PandaMigrationPhase,
	PandaMigrationStageId,
	PandaRewriteCandidateKind,
} from "../../identifiers.ts";
import type { PandaMigrationArtifacts, PandaMigrationStage } from "./migration-pipeline.ts";
import type { PandaMigrationServices } from "./pipeline-services.ts";

export interface PandaMigrationStageFactory {
	create(services: PandaMigrationServices): readonly PandaMigrationStage[];
}

export function createPandaMigrationStages(
	services: PandaMigrationServices,
): readonly PandaMigrationStage[] {
	return [
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
}

export const DEFAULT_PANDA_MIGRATION_STAGE_FACTORY: PandaMigrationStageFactory = {
	create: createPandaMigrationStages,
};
