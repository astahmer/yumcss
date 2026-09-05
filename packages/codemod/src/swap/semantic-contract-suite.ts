import type {
	AdapterEmitResult,
	AdapterProjectConfig,
	AdapterValidationResult,
	StyleAdapter,
} from "./adapter-contract.ts";
import type { AdapterCapabilityMode, AdapterCapabilityReport } from "./capabilities.ts";
import { inspectAdapterCapabilities } from "./capabilities.ts";
import type { StyleAdapterRegistry } from "./adapter-registry.ts";
import {
	STYLE_LOWERING_REGISTRY,
	type StyleLoweringPlan,
	type StyleLoweringRegistry,
} from "./lowering.ts";
import {
	styleProgramFromRules,
	type StyleProgram,
	type StyleProgramResidual,
} from "./semantic-ir.ts";
import type { StyleRepresentationKind } from "./identifiers.ts";
import { AdapterLossinessTag } from "./adapter-contract.ts";

/** Versioned contract for semantic-program capability coverage. */
export const SEMANTIC_CONTRACT_SUITE_SCHEMA = "pandwind.semantic-contract-suite/1" as const;

export interface SemanticContractFixture {
	readonly name: string;
	readonly program: StyleProgram;
	readonly file?: string;
}

export const enum SemanticContractOutcomeTag {
	Validated = "validated",
	ExplicitResidual = "explicit-residual",
}
export type SemanticContractOutcome = "validated" | "explicit-residual";

export interface SemanticContractCase {
	readonly fixture: string;
	readonly targetAdapter: string;
	readonly mode: AdapterCapabilityMode;
	readonly outcome: SemanticContractOutcome;
	readonly representation: StyleRepresentationKind;
	readonly plan: StyleLoweringPlan;
	readonly capabilities: AdapterCapabilityReport;
	readonly validation?: AdapterValidationResult;
}

export interface SemanticContractFailure {
	readonly fixture: string;
	readonly targetAdapter: string;
	readonly mode: AdapterCapabilityMode;
	readonly reason: string;
}

export interface SemanticContractReport {
	readonly schema: typeof SEMANTIC_CONTRACT_SUITE_SCHEMA;
	readonly cases: readonly SemanticContractCase[];
	readonly failures: readonly SemanticContractFailure[];
	readonly validated: number;
	readonly explicitResiduals: number;
	readonly failed: number;
}

export interface SemanticContractSuite {
	run(fixtures: readonly SemanticContractFixture[]): SemanticContractReport;
}

const effectiveCapabilities = (
	report: AdapterCapabilityReport,
	plan: StyleLoweringPlan,
): AdapterCapabilityReport => {
	const resolved = new Set(plan.resolvedCapabilities ?? []);
	if (resolved.size === 0) return report;
	const blockers = report.blockers.filter((issue) => !resolved.has(issue.capability));
	return {
		...report,
		blockers,
		convertible: blockers.length === 0,
	};
};

const residualsFor = (plan: StyleLoweringPlan): readonly StyleProgramResidual[] => [
	...plan.program.residuals,
	...plan.residuals,
];

function targetProgram(
	target: StyleAdapter,
	emitted: AdapterEmitResult,
	program: StyleProgram,
	context: {
		readonly file: string;
		readonly config: AdapterProjectConfig;
	},
): { readonly program: StyleProgram; readonly residuals: readonly StyleProgramResidual[] } {
	const reparsed = target.parse(emitted.text, {
		file: context.file,
		source: emitted.text,
		config: context.config,
	});
	return {
		program:
			emitted.semantic ??
			(reparsed.matches.length === 0
				? program
				: styleProgramFromRules(
						reparsed.matches.flatMap((match) => match.program.rules),
						{ source: program.source, residuals: reparsed.residuals },
					)),
		residuals: reparsed.residuals,
	};
}

function validateTarget(
	target: StyleAdapter,
	fixture: SemanticContractFixture,
	plan: StyleLoweringPlan,
	config: AdapterProjectConfig,
): {
	readonly validation: AdapterValidationResult;
	readonly residuals: readonly StyleProgramResidual[];
} {
	const emitted = target.emit(plan.program, {
		file: fixture.file ?? "semantic-contract.tsx",
		config,
		mode: "partial",
		index: 0,
	});
	const parsed = targetProgram(target, emitted, plan.program, {
		file: fixture.file ?? "semantic-contract.tsx",
		config,
	});
	const residuals = [...plan.residuals, ...emitted.residuals, ...parsed.residuals];
	return {
		validation: target.validate(plan.program, parsed.program, residuals),
		residuals,
	};
}

export function createSemanticContractSuite(
	registry: StyleAdapterRegistry,
	options: { readonly loweringRegistry?: StyleLoweringRegistry } = {},
): SemanticContractSuite {
	const loweringRegistry = options.loweringRegistry ?? STYLE_LOWERING_REGISTRY;
	return {
		run(fixtures) {
			const cases: SemanticContractCase[] = [];
			const failures: SemanticContractFailure[] = [];
			for (const fixture of fixtures) {
				for (const target of registry.adapters) {
					const config = target.loadConfig({
						file: fixture.file ?? "semantic-contract.tsx",
						source: "",
					});
					for (const mode of ["safe", "partial"] as const) {
						const plan = loweringRegistry.plan({
							program: fixture.program,
							target: target.capabilities,
							mode,
						});
						const capabilities = effectiveCapabilities(
							inspectAdapterCapabilities(target.capabilities, plan.program, mode),
							plan,
						);
						const residuals = residualsFor(plan);
						if (capabilities.blockers.length > 0 || residuals.length > 0) {
							cases.push({
								fixture: fixture.name,
								targetAdapter: target.id,
								mode,
								outcome: "explicit-residual",
								representation: plan.representation,
								plan,
								capabilities,
							});
							continue;
						}
						let validation: AdapterValidationResult;
						try {
							const targetResult = validateTarget(target, fixture, plan, config);
							if (targetResult.residuals.length > 0) {
								cases.push({
									fixture: fixture.name,
									targetAdapter: target.id,
									mode,
									outcome: "explicit-residual",
									representation: plan.representation,
									plan,
									capabilities,
								});
								continue;
							}
							validation = targetResult.validation;
							if (!validation.valid && validation.lossiness === AdapterLossinessTag.Unsupported) {
								// An unsupported verdict is typed, honest evidence that this
								// target cannot represent the program, not a broken
								// conversion. Classify it as explicit-residual.
								cases.push({
									fixture: fixture.name,
									targetAdapter: target.id,
									mode,
									outcome: SemanticContractOutcomeTag.ExplicitResidual,
									representation: plan.representation,
									plan,
									capabilities,
									validation,
								});
								continue;
								}
						} catch (error) {
							failures.push({
								fixture: fixture.name,
								targetAdapter: target.id,
								mode,
								reason: error instanceof Error ? error.message : String(error),
							});
							continue;
						}
						cases.push({
							fixture: fixture.name,
							targetAdapter: target.id,
							mode,
							outcome: "validated",
							representation: plan.representation,
							plan,
							capabilities,
							validation,
						});
						if (!validation.valid)
							failures.push({
								fixture: fixture.name,
								targetAdapter: target.id,
								mode,
								reason: validation.differences.join("; "),
							});
					}
				}
			}
			return {
				schema: SEMANTIC_CONTRACT_SUITE_SCHEMA,
				cases,
				failures,
				validated: cases.filter((item) => item.outcome === SemanticContractOutcomeTag.Validated)
					.length,
				explicitResiduals: cases.filter(
					(item) => item.outcome === SemanticContractOutcomeTag.ExplicitResidual,
				).length,
				failed: failures.length,
			};
		},
	};
}
