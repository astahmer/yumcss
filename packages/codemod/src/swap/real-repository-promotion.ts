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
	readonly install?: readonly PromotionCommand[];
	readonly checks?: readonly PromotionCommand[];
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

			const commands = request.install ?? [];
			let commandsPassed = true;
			for (const command of commands) {
				try {
					const result = await driver.run(command);
					if (result.code !== 0) {
						commandsPassed = false;
						errors.push(commandDetail(command, result));
					}
				} catch (error) {
					commandsPassed = false;
					errors.push(errorText(error));
				}
			}
			stages.push({
				stage: RealRepositoryPromotionStageTag.Install,
				passed: commandsPassed,
				...(commandsPassed ? {} : { detail: "dependency installation failed" }),
			});
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
			for (const command of request.checks ?? []) {
				try {
					const result = await driver.run(command);
					if (result.code !== 0) {
						checksPassed = false;
						errors.push(commandDetail(command, result));
					}
				} catch (error) {
					checksPassed = false;
					errors.push(errorText(error));
				}
			}
			stages.push({ stage: RealRepositoryPromotionStageTag.Checks, passed: checksPassed });
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
