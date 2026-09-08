import { AstryxDocsLane, AstryxDocsMigration } from "./migration-proofs/migrate-astryx-docs.ts";
import { ChakraDocsLane, ChakraDocsMigration } from "./migration-proofs/migrate-chakra-docs.ts";
import { EffectDocsLane, EffectDocsMigration } from "./migration-proofs/migrate-effect-docs.ts";
import {
	EmotionSiteMigration,
	EmotionSiteMigrationLane,
} from "./migration-proofs/migrate-emotion-site.ts";
import { PostHogDocsLane, PostHogDocsMigration } from "./migration-proofs/migrate-posthog-docs.ts";
import { runReferenceRepositoryMigration } from "./migration-proofs/migrate-reference-repository.ts";
import { ShadcnV4Migration, ShadcnV4MigrationLane } from "./migration-proofs/migrate-shadcn-v4.ts";
import {
	StyledComponentsDocsLane,
	StyledComponentsDocsMigration,
} from "./migration-proofs/migrate-styled-components-docs.ts";
import { StylexDocsLane, StylexDocsMigration } from "./migration-proofs/migrate-stylex-docs.ts";
import {
	TailwindDocsLane,
	TailwindDocsMigration,
} from "./migration-proofs/migrate-tailwind-docs.ts";
import type { ReferenceWorkspace } from "./reference-workspace.ts";

export const MIGRATION_PROOF_SCENARIO = {
	AstryxDocs: "astryx-docs",
	ChakraDocs: "chakra-docs",
	EffectDocs: "effect-docs",
	EmotionSite: "emotion-site",
	PostHogDocs: "posthog-docs",
	ReferenceRepository: "reference-repository",
	ShadcnV4: "shadcn-v4",
	StyledComponentsDocs: "styled-components-docs",
	StylexDocs: "stylex-docs",
	TailwindDocs: "tailwind-docs",
} as const;

export type MigrationProofScenarioId =
	(typeof MIGRATION_PROOF_SCENARIO)[keyof typeof MIGRATION_PROOF_SCENARIO];

export const MIGRATION_PROOF_LANE = {
	Baseline: "baseline",
} as const;

export interface MigrationProofScenarioContext {
	readonly workspace: ReferenceWorkspace;
	/** The exact checkout or nested project root used by this scenario. */
	readonly sourceRoot: string;
	readonly outputRoot?: string;
	readonly reportPath?: string;
	readonly reference?: string;
}

export interface LegacyMigrationProofRequest {
	readonly lane?: string;
	readonly sourceRoot?: string;
	readonly outputRoot?: string;
	readonly reportPath?: string;
	readonly reference?: string;
}

export interface MigrationProofScenario {
	readonly id: MigrationProofScenarioId;
	readonly label: string;
	readonly references: (request: LegacyMigrationProofRequest) => readonly string[];
	readonly lanes: readonly string[];
	readonly resolveSourceRoot: (workspace: ReferenceWorkspace) => string;
	readonly run: (
		lane: string | undefined,
		context: MigrationProofScenarioContext,
	) => Promise<unknown>;
	readonly parseLegacyArgs?: (args: readonly string[]) => LegacyMigrationProofRequest;
	readonly isFailure?: (result: unknown) => boolean;
}

function requireLane(id: MigrationProofScenarioId, lane: string | undefined): string {
	if (lane === undefined) throw new Error(`migration proof '${id}' requires a lane`);
	return lane;
}

function positionalArgs(args: readonly string[]): readonly string[] {
	const values: string[] = [];
	for (let index = 0; index < args.length; index++) {
		const value = args[index];
		if (value === undefined || value.startsWith("-")) continue;
		const previous = args[index - 1];
		if (previous === "--reference" || previous === "--report") continue;
		values.push(value);
	}
	return values;
}

function optionValue(args: readonly string[], name: string): string | undefined {
	const equals = args.find((argument) => argument.startsWith(`${name}=`));
	if (equals !== undefined) return equals.slice(name.length + 1);
	const index = args.indexOf(name);
	return index < 0 ? undefined : args[index + 1];
}

function legacyOutput(args: readonly string[], index: number): string | undefined {
	return positionalArgs(args)[index];
}

const asTryx: MigrationProofScenario = {
	id: MIGRATION_PROOF_SCENARIO.AstryxDocs,
	label: "Astryx documentation site",
	references: () => ["astryx"],
	lanes: [AstryxDocsLane.RuntimeCss, AstryxDocsLane.StaticCss, AstryxDocsLane.DesignDss],
	resolveSourceRoot: (workspace) => workspace.path("astryx/apps/docsite"),
	run: (lane, context) =>
		AstryxDocsMigration.run(
			requireLane(MIGRATION_PROOF_SCENARIO.AstryxDocs, lane) as AstryxDocsLane,
			{
				referenceRoot: context.sourceRoot,
				outputRoot: context.outputRoot,
			},
		),
	parseLegacyArgs: (args) => ({
		lane: legacyOutput(args, 0),
		sourceRoot: legacyOutput(args, 1),
		outputRoot: legacyOutput(args, 2),
	}),
};

const chakra: MigrationProofScenario = {
	id: MIGRATION_PROOF_SCENARIO.ChakraDocs,
	label: "Chakra UI documentation site",
	references: () => ["chakra-ui"],
	lanes: [ChakraDocsLane.CssClass, ChakraDocsLane.DesignCss],
	resolveSourceRoot: (workspace) => workspace.path("chakra-ui"),
	run: (lane, context) =>
		ChakraDocsMigration.run(
			requireLane(MIGRATION_PROOF_SCENARIO.ChakraDocs, lane) as ChakraDocsLane,
			{
				referenceRoot: context.sourceRoot,
				outputRoot: context.outputRoot,
			},
		),
	parseLegacyArgs: (args) => ({
		lane: legacyOutput(args, 0),
		outputRoot: args.includes("--dry-run") ? undefined : legacyOutput(args, 1),
	}),
};

const effect: MigrationProofScenario = {
	id: MIGRATION_PROOF_SCENARIO.EffectDocs,
	label: "Effect website",
	references: () => ["effect-ts-website"],
	lanes: [EffectDocsLane.Tw, EffectDocsLane.Css, EffectDocsLane.DesignCss],
	resolveSourceRoot: (workspace) => workspace.path("effect-ts-website"),
	run: (lane, context) =>
		EffectDocsMigration.run(
			requireLane(MIGRATION_PROOF_SCENARIO.EffectDocs, lane) as EffectDocsLane,
			{
				referenceRoot: context.sourceRoot,
				outputRoot: context.outputRoot,
			},
		),
	parseLegacyArgs: (args) => ({
		lane: legacyOutput(args, 0) ?? EffectDocsLane.Tw,
		outputRoot: legacyOutput(args, 1) ?? "/tmp/pandwind-effect-tw",
	}),
};

const emotion: MigrationProofScenario = {
	id: MIGRATION_PROOF_SCENARIO.EmotionSite,
	label: "Emotion site",
	references: () => ["emotion-clean"],
	lanes: [EmotionSiteMigrationLane.CssClass],
	resolveSourceRoot: (workspace) => workspace.path("emotion-clean"),
	run: (lane, context) =>
		EmotionSiteMigration.run(
			requireLane(MIGRATION_PROOF_SCENARIO.EmotionSite, lane) as EmotionSiteMigrationLane,
			{
				referenceRoot: context.sourceRoot,
				outputRoot: context.outputRoot,
			},
		),
	parseLegacyArgs: (args) => ({ outputRoot: legacyOutput(args, 0) }),
};

const posthog: MigrationProofScenario = {
	id: MIGRATION_PROOF_SCENARIO.PostHogDocs,
	label: "PostHog documentation site",
	references: () => ["posthog-com"],
	lanes: [
		MIGRATION_PROOF_LANE.Baseline,
		PostHogDocsLane.Tw,
		PostHogDocsLane.CssClass,
		PostHogDocsLane.DesignCss,
	],
	resolveSourceRoot: (workspace) => workspace.path("posthog-com"),
	run: (lane, context) => {
		if (lane === MIGRATION_PROOF_LANE.Baseline)
			return PostHogDocsMigration.materializeBaseline({
				referenceRoot: context.sourceRoot,
				outputRoot: context.outputRoot,
			});
		return PostHogDocsMigration.run(
			requireLane(MIGRATION_PROOF_SCENARIO.PostHogDocs, lane) as PostHogDocsLane,
			{
				referenceRoot: context.sourceRoot,
				outputRoot: context.outputRoot,
			},
		);
	},
	parseLegacyArgs: (args) => ({
		lane: legacyOutput(args, 0),
		outputRoot: legacyOutput(args, 1),
	}),
};

const referenceRepository: MigrationProofScenario = {
	id: MIGRATION_PROOF_SCENARIO.ReferenceRepository,
	label: "pinned repository adapter migration",
	references: (request) => (request.reference === undefined ? [] : [request.reference]),
	lanes: [],
	resolveSourceRoot: (workspace) => workspace.root,
	run: (_lane, context) => {
		if (context.reference === undefined)
			throw new Error("migration proof 'reference-repository' requires --reference <id>");
		return runReferenceRepositoryMigration(context.reference, {
			referenceRoot: context.workspace.root,
			outputRoot: context.outputRoot,
			reportPath: context.reportPath,
		});
	},
	parseLegacyArgs: (args) => ({
		reference: optionValue(args, "--reference"),
		reportPath: optionValue(args, "--report"),
	}),
	isFailure: (result) => {
		if (typeof result !== "object" || result === null) return false;
		const report = result as { skipped?: unknown; residuals?: unknown };
		return (
			(typeof report.skipped === "number" && report.skipped > 0) ||
			(typeof report.residuals === "number" && report.residuals > 0)
		);
	},
};

const shadcn: MigrationProofScenario = {
	id: MIGRATION_PROOF_SCENARIO.ShadcnV4,
	label: "shadcn/ui v4",
	references: () => ["shadcn-ui"],
	lanes: [ShadcnV4MigrationLane.Tw, ShadcnV4MigrationLane.Css, ShadcnV4MigrationLane.Dcss],
	resolveSourceRoot: (workspace) => workspace.path("shadcn-ui"),
	run: (lane, context) =>
		ShadcnV4Migration.run(
			requireLane(MIGRATION_PROOF_SCENARIO.ShadcnV4, lane) as ShadcnV4MigrationLane,
			{
				referenceRoot: context.sourceRoot,
				outputRoot: context.outputRoot,
				reportPath: context.reportPath,
			},
		),
	parseLegacyArgs: (args) => ({
		lane: legacyOutput(args, 0),
		outputRoot: legacyOutput(args, 1),
		reportPath: optionValue(args, "--report"),
	}),
};

const styledComponents: MigrationProofScenario = {
	id: MIGRATION_PROOF_SCENARIO.StyledComponentsDocs,
	label: "styled-components documentation site",
	references: () => ["styled-components-website"],
	lanes: [StyledComponentsDocsLane.RuntimeCss, StyledComponentsDocsLane.DesignCss],
	resolveSourceRoot: (workspace) => workspace.path("styled-components-website"),
	run: (lane, context) =>
		StyledComponentsDocsMigration.run(
			requireLane(MIGRATION_PROOF_SCENARIO.StyledComponentsDocs, lane) as StyledComponentsDocsLane,
			{
				referenceRoot: context.sourceRoot,
				outputRoot: context.outputRoot,
			},
		),
	parseLegacyArgs: (args) => ({ lane: legacyOutput(args, 0), outputRoot: legacyOutput(args, 1) }),
};

const stylex: MigrationProofScenario = {
	id: MIGRATION_PROOF_SCENARIO.StylexDocs,
	label: "StyleX documentation site",
	references: () => ["stylex"],
	lanes: [StylexDocsLane.RuntimeCss, StylexDocsLane.AtomicCss, StylexDocsLane.DesignDss],
	resolveSourceRoot: (workspace) => workspace.path("stylex/packages/docs"),
	run: (lane, context) =>
		StylexDocsMigration.run(
			context.sourceRoot,
			requireLane(MIGRATION_PROOF_SCENARIO.StylexDocs, lane) as StylexDocsLane,
			context.outputRoot,
		),
	parseLegacyArgs: (args) => ({
		lane: legacyOutput(args, 0),
		sourceRoot: legacyOutput(args, 1),
		outputRoot: legacyOutput(args, 2),
	}),
};

const tailwind: MigrationProofScenario = {
	id: MIGRATION_PROOF_SCENARIO.TailwindDocs,
	label: "Tailwind CSS documentation site",
	references: () => ["tailwindcss.com"],
	lanes: [TailwindDocsLane.Tw, TailwindDocsLane.CssClass, TailwindDocsLane.DesignDss],
	resolveSourceRoot: (workspace) => workspace.path("tailwindcss.com"),
	run: (lane, context) =>
		TailwindDocsMigration.run(
			requireLane(MIGRATION_PROOF_SCENARIO.TailwindDocs, lane) as TailwindDocsLane,
			{
				referenceRoot: context.sourceRoot,
				outputRoot: context.outputRoot,
			},
		),
	parseLegacyArgs: (args) => ({ lane: legacyOutput(args, 0), outputRoot: legacyOutput(args, 1) }),
};

export const MIGRATION_PROOF_SCENARIOS: readonly MigrationProofScenario[] = [
	asTryx,
	chakra,
	effect,
	emotion,
	posthog,
	referenceRepository,
	shadcn,
	styledComponents,
	stylex,
	tailwind,
];

export function migrationProofScenario(id: string): MigrationProofScenario | undefined {
	return MIGRATION_PROOF_SCENARIOS.find((scenario) => scenario.id === id);
}
