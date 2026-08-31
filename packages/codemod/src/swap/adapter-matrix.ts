import type { AdapterParseContext } from "./adapter-contract.ts";
import type { StyleAdapterRegistry } from "./adapter-registry.ts";
import { runAdapterMigration, type AdapterMigrationResult } from "./adapter-migration.ts";

/** Versioned contract for the complete registered source/target route matrix. */
export const ADAPTER_MATRIX_SCHEMA = "pandwind.adapter-matrix/1" as const;

export type AdapterMatrixScenario = "happy" | "edge" | "malformed";

export interface AdapterMatrixFixture {
	readonly sourceAdapter: string;
	readonly file: string;
	readonly source: string;
	readonly scenario?: AdapterMatrixScenario;
	readonly semantic?: AdapterParseContext["semantic"];
}

export interface AdapterMatrixCase {
	readonly sourceAdapter: string;
	readonly targetAdapter: string;
	readonly mode: "safe" | "partial";
	readonly scenario: AdapterMatrixScenario;
	readonly result: AdapterMigrationResult;
}

export interface AdapterMatrixFailure {
	readonly sourceAdapter: string;
	readonly targetAdapter: string;
	readonly mode: "safe" | "partial";
	readonly scenario: AdapterMatrixScenario;
	readonly reason: string;
}

export interface AdapterMatrixReport {
	readonly schema: typeof ADAPTER_MATRIX_SCHEMA;
	readonly cases: readonly AdapterMatrixCase[];
	readonly failures: readonly AdapterMatrixFailure[];
	readonly passed: number;
	readonly failed: number;
}

export interface BidirectionalAdapterMatrix {
	run(fixtures: readonly AdapterMatrixFixture[]): AdapterMatrixReport;
}

const typedMarker =
	/(capability-blocked|parse-residual|lowering-residual|host-rewrite-required|configuration-residual)/;

function routeFailures(caseResult: AdapterMatrixCase): readonly AdapterMatrixFailure[] {
	const { sourceAdapter, targetAdapter, mode, scenario, result } = caseResult;
	const failures: AdapterMatrixFailure[] = [];
	const route = { sourceAdapter, targetAdapter, mode, scenario };
	const evidence = result.converted > 0 || result.residuals.length > 0 || result.skipped > 0;
	if (!evidence)
		failures.push({ ...route, reason: "route produced neither conversion nor residual evidence" });
	if (result.loweringPlans.length === 0 && result.converted > 0)
		failures.push({ ...route, reason: "converted route exposed no lowering plan" });
	if (result.skipped > 0 && result.residuals.length === 0)
		failures.push({ ...route, reason: "skipped route exposed no residual" });
	if (
		result.converted > 0 &&
		result.residuals.length === 0 &&
		!result.validations.every((item) => item.valid)
	)
		failures.push({ ...route, reason: "clean conversion has invalid semantic validation" });
	if (result.code.includes("pandwind:migrate-skip")) {
		if (!typedMarker.test(result.code))
			failures.push({ ...route, reason: "skip marker has no typed semantic cause" });
	}
	return failures;
}

/**
 * Runs every registered source against every registered target in both
 * capability modes. A residual is a valid outcome only when it is explicit;
 * the matrix is primarily a no-silent-loss contract.
 */
export function createBidirectionalAdapterMatrix(
	registry: StyleAdapterRegistry,
	options: {
		readonly readFile?: (file: string) => string | undefined;
		readonly root?: string;
	} = {},
): BidirectionalAdapterMatrix {
	return {
		run(fixtures) {
			const fixturesByAdapter = new Map<string, AdapterMatrixFixture[]>();
			for (const fixture of fixtures) {
				const adapterFixtures = fixturesByAdapter.get(fixture.sourceAdapter) ?? [];
				adapterFixtures.push(fixture);
				fixturesByAdapter.set(fixture.sourceAdapter, adapterFixtures);
			}
			const cases: AdapterMatrixCase[] = [];
			const failures: AdapterMatrixFailure[] = [];
			for (const source of registry.adapters) {
				const adapterFixtures = fixturesByAdapter.get(source.id) ?? [];
				if (adapterFixtures.length === 0) {
					for (const target of registry.adapters)
						for (const mode of ["safe", "partial"] as const)
							failures.push({
								sourceAdapter: source.id,
								targetAdapter: target.id,
								mode,
								scenario: "happy",
								reason: "registered source has no matrix fixture",
							});
					continue;
				}
				for (const fixture of adapterFixtures) {
					const scenario = fixture.scenario ?? "happy";
					for (const target of registry.adapters) {
						for (const mode of ["safe", "partial"] as const) {
							const result = runAdapterMigration(fixture.source, {
								from: source.id,
								to: target.id,
								file: fixture.file,
								mode,
								root: options.root,
								semantic: fixture.semantic,
								readFile: options.readFile,
								adapterRegistry: registry,
							});
							const caseResult = {
								sourceAdapter: source.id,
								targetAdapter: target.id,
								mode,
								scenario,
								result,
							};
							cases.push(caseResult);
							failures.push(...routeFailures(caseResult));
						}
					}
				}
			}
			return {
				schema: ADAPTER_MATRIX_SCHEMA,
				cases,
				failures,
				passed: cases.length - failures.length,
				failed: failures.length,
			};
		},
	};
}
