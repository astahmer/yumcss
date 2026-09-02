import type { RealRepositoryReference } from "./real-repository-corpus.ts";

/** Versioned orchestration result for installed real-repository promotion. */
export const REAL_REPOSITORY_PROMOTION_SCHEMA = "pandwind.real-repository-promotion/1" as const;

export const enum RealRepositoryPromotionStageTag {
	Materialize = "materialize",
	Install = "install",
	Migrate = "migrate",
	Checks = "checks",
	Proof = "proof",
}

export type RealRepositoryPromotionStage = `${RealRepositoryPromotionStageTag}`;

export interface PromotionCommand {
	readonly name: string;
	readonly args: readonly string[];
	readonly cwd: string;
}

export interface PromotionCommandResult {
	readonly code: number;
	readonly stdout?: string;
	readonly stderr?: string;
}

export interface PromotionMigrationResult {
	readonly converted: number;
	readonly skipped: number;
	readonly residuals: number;
	readonly manualChanges: number;
}

export interface PromotionProofResult {
	readonly canonicalCssEqual: boolean;
	readonly browserEquivalent: boolean;
	readonly hydrationEquivalent: boolean;
	readonly streamingEquivalent: boolean | null;
	readonly sourceCssBytes: number;
	readonly targetCssBytes: number;
	readonly clientJavaScriptBytes?: number;
	readonly errors: readonly string[];
}

export interface PromotionWorkspace {
	readonly sourceCheckout: string;
	readonly workingCopy: string;
}

export interface RealRepositoryPromotionDriver {
	materialize(reference: RealRepositoryReference): Promise<PromotionWorkspace>;
	run(command: PromotionCommand): Promise<PromotionCommandResult>;
	migrate(
		reference: RealRepositoryReference,
		workspace: PromotionWorkspace,
	): Promise<PromotionMigrationResult>;
	prove(
		reference: RealRepositoryReference,
		workspace: PromotionWorkspace,
		migration: PromotionMigrationResult,
	): Promise<PromotionProofResult>;
}

export interface RealRepositoryPromotionRequest {
	readonly reference: RealRepositoryReference;
	/** Explicit dependency installation commands; an empty list is a failed proof. */
	readonly install: readonly PromotionCommand[];
	/** Explicit build/typecheck/lint (or equivalent) commands; an empty list is a failed proof. */
	readonly checks: readonly PromotionCommand[];
	readonly requireStreamingProof?: boolean;
}

export interface RealRepositoryPromotionStageResult {
	readonly stage: RealRepositoryPromotionStage;
	readonly passed: boolean;
	readonly detail?: string;
}

export interface RealRepositoryPromotionResult {
	readonly schema: typeof REAL_REPOSITORY_PROMOTION_SCHEMA;
	readonly id: string;
	readonly repository: string;
	readonly commit: string;
	readonly status: "passed" | "failed";
	readonly stages: readonly RealRepositoryPromotionStageResult[];
	readonly migration?: PromotionMigrationResult;
	readonly proof?: PromotionProofResult;
	readonly errors: readonly string[];
}

export interface RealRepositoryPromotionRunner {
	run(request: RealRepositoryPromotionRequest): Promise<RealRepositoryPromotionResult>;
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function commandDetail(command: PromotionCommand, result: PromotionCommandResult): string {
	return `${command.name} ${command.args.join(" ")} exited with ${result.code}`;
}

async function runCommands(
	driver: RealRepositoryPromotionDriver,
	commands: readonly PromotionCommand[],
	stage: RealRepositoryPromotionStage,
	errors: string[],
): Promise<RealRepositoryPromotionStageResult> {
	if (commands.length === 0) {
		const detail = `${stage} stage has no executable commands`;
		errors.push(detail);
		return { stage, passed: false, detail };
	}
	let passed = true;
	for (const command of commands) {
		try {
			const result = await driver.run(command);
			if (result.code !== 0) {
				passed = false;
				errors.push(commandDetail(command, result));
			}
		} catch (error) {
			passed = false;
			errors.push(errorText(error));
		}
	}
	return {
		stage,
		passed,
		...(passed ? {} : { detail: `${stage} commands failed` }),
	};
}

/**
 * Compose executable repository promotion from environment-owned ports. The
 * runner owns stage ordering and promotion policy; drivers own git, package
 * managers, migration materialization, and browser/server execution.
 */
export function createRealRepositoryPromotionRunner(
	driver: RealRepositoryPromotionDriver,
): RealRepositoryPromotionRunner {
	return {
		async run(request) {
			const { reference } = request;
			const stages: RealRepositoryPromotionStageResult[] = [];
			const errors: string[] = [];
			let workspace: PromotionWorkspace | undefined;
			let migration: PromotionMigrationResult | undefined;
			let proof: PromotionProofResult | undefined;

			try {
				workspace = await driver.materialize(reference);
				stages.push({ stage: RealRepositoryPromotionStageTag.Materialize, passed: true });
			} catch (error) {
				const detail = errorText(error);
				stages.push({ stage: RealRepositoryPromotionStageTag.Materialize, passed: false, detail });
				errors.push(detail);
			}
			if (workspace === undefined)
				return {
					schema: REAL_REPOSITORY_PROMOTION_SCHEMA,
					id: reference.id,
					repository: reference.repository,
					commit: reference.commit,
					status: "failed",
					stages,
					errors,
				};

			const install = await runCommands(
				driver,
				request.install,
				RealRepositoryPromotionStageTag.Install,
				errors,
			);
			stages.push(install);
			const commandsPassed = install.passed;
			if (!commandsPassed) return failedResult(reference, stages, errors);

			try {
				migration = await driver.migrate(reference, workspace);
				const passed =
					migration.skipped === 0 && migration.residuals === 0 && migration.manualChanges === 0;
				stages.push({
					stage: RealRepositoryPromotionStageTag.Migrate,
					passed,
					...(passed ? {} : { detail: "migration has residuals, skips, or manual changes" }),
				});
				if (!passed) errors.push("migration did not produce a clean repository result");
			} catch (error) {
				const detail = errorText(error);
				stages.push({ stage: RealRepositoryPromotionStageTag.Migrate, passed: false, detail });
				errors.push(detail);
			}
			if (migration === undefined || errors.length > 0)
				return failedResult(reference, stages, errors, migration);

			let checksPassed = true;
			const checks = await runCommands(
				driver,
				request.checks,
				RealRepositoryPromotionStageTag.Checks,
				errors,
			);
			checksPassed = checks.passed;
			stages.push(checks);
			if (!checksPassed) return failedResult(reference, stages, errors, migration);

			try {
				proof = await driver.prove(reference, workspace, migration);
				const streamingPassed =
					!request.requireStreamingProof || proof.streamingEquivalent === true;
				const passed =
					proof.canonicalCssEqual &&
					proof.browserEquivalent &&
					proof.hydrationEquivalent &&
					streamingPassed &&
					proof.targetCssBytes <= proof.sourceCssBytes &&
					proof.errors.length === 0;
				stages.push({
					stage: RealRepositoryPromotionStageTag.Proof,
					passed,
					...(passed ? {} : { detail: "differential proof requirements failed" }),
				});
				if (!passed) errors.push("differential proof requirements failed");
			} catch (error) {
				const detail = errorText(error);
				stages.push({ stage: RealRepositoryPromotionStageTag.Proof, passed: false, detail });
				errors.push(detail);
			}
			return {
				schema: REAL_REPOSITORY_PROMOTION_SCHEMA,
				id: reference.id,
				repository: reference.repository,
				commit: reference.commit,
				status: errors.length === 0 ? "passed" : "failed",
				stages,
				migration,
				proof,
				errors: [...new Set(errors)],
			};
		},
	};
}

function failedResult(
	reference: RealRepositoryReference,
	stages: readonly RealRepositoryPromotionStageResult[],
	errors: readonly string[],
	migration?: PromotionMigrationResult,
): RealRepositoryPromotionResult {
	return {
		schema: REAL_REPOSITORY_PROMOTION_SCHEMA,
		id: reference.id,
		repository: reference.repository,
		commit: reference.commit,
		status: "failed",
		stages,
		...(migration === undefined ? {} : { migration }),
		errors: [...new Set(errors)],
	};
}
