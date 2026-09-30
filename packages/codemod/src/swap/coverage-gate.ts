import type { AdapterCapability } from "./capabilities.ts";
import type { StyleAdapterRegistry } from "./adapter-registry.ts";
import { RealRepositoryProofDimension, RealRepositoryProofDimensionStatus } from "./identifiers.ts";

/** Versioned evidence contract for adapter and capability coverage gates. */
export const ADAPTER_COVERAGE_SCHEMA = "pandwind.adapter-coverage/1" as const;

export type AdapterCoverageEvidenceKind = "contract" | "real-repository" | "browser";

export const enum AdapterCoverageEvidenceKindTag {
	Contract = "contract",
	RealRepository = "real-repository",
	Browser = "browser",
}

export interface AdapterCoverageEvidence {
	readonly adapter: string;
	readonly fixture: string;
	readonly kind: AdapterCoverageEvidenceKind;
	readonly capabilities: readonly AdapterCapability[];
	/** Production proof emitted by a real-repository differential runner. */
	readonly proof?: Readonly<
		Partial<Record<RealRepositoryProofDimension, RealRepositoryProofDimensionStatus>>
	>;
}

export interface AdapterCoveragePolicy {
	readonly minimumFixturesPerAdapter?: number;
	/** Minimum direct adapter-contract fixtures, separate from real corpora. */
	readonly minimumContractFixturesPerAdapter?: number;
	readonly minimumRealRepositoryFixturesPerAdapter?: number;
	readonly requiredCapabilities?: readonly AdapterCapability[];
	/** Capabilities that every registered adapter must exercise directly. */
	readonly requiredCapabilitiesPerAdapter?: readonly AdapterCapability[];
	/** Production dimensions required for selected, promoted adapters. */
	readonly requiredProofDimensionsByAdapter?: Readonly<
		Partial<Record<string, readonly RealRepositoryProofDimension[]>>
	>;
	/** Target-only or intentionally out-of-scope registry entries. */
	readonly excludedAdapters?: readonly string[];
}

export interface AdapterCoverageFailure {
	readonly adapter?: string;
	readonly capability?: AdapterCapability;
	readonly dimension?: RealRepositoryProofDimension;
	readonly message: string;
}

export interface AdapterCoverageEntry {
	readonly adapter: string;
	readonly fixtures: number;
	readonly contractFixtures: number;
	readonly realRepositoryFixtures: number;
	readonly browserFixtures: number;
	readonly capabilities: Readonly<Partial<Record<AdapterCapability, number>>>;
	readonly proof: Readonly<Partial<Record<RealRepositoryProofDimension, number>>>;
}

export interface AdapterCoverageReport {
	readonly schema: typeof ADAPTER_COVERAGE_SCHEMA;
	readonly entries: readonly AdapterCoverageEntry[];
	readonly capabilityTotals: Readonly<Partial<Record<AdapterCapability, number>>>;
	readonly proofTotals: Readonly<Partial<Record<RealRepositoryProofDimension, number>>>;
	readonly failures: readonly AdapterCoverageFailure[];
	readonly passed: boolean;
}

export interface AdapterCoverageGate {
	evaluate(
		registry: StyleAdapterRegistry,
		evidence: readonly AdapterCoverageEvidence[],
		policy?: AdapterCoveragePolicy,
	): AdapterCoverageReport;
}

const countBy = <T extends string>(values: readonly T[]): Partial<Record<T, number>> => {
	const counts: Partial<Record<T, number>> = {};
	for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
	return counts;
};

const passedProofDimensions = (
	evidence: readonly AdapterCoverageEvidence[],
): Partial<Record<RealRepositoryProofDimension, number>> =>
	countBy(
		evidence.flatMap((item) =>
			Object.entries(item.proof ?? {})
				.filter(([, status]) => status === RealRepositoryProofDimensionStatus.Passed)
				.map(([dimension]) => dimension as RealRepositoryProofDimension),
		),
	);

/**
 * Gate the evidence supplied by a composition root. The gate does not know
 * how fixtures are parsed or how browser proof is run; those are separate
 * ports. This keeps the policy reusable for third-party adapter registries.
 */
export function createAdapterCoverageGate(): AdapterCoverageGate {
	return {
		evaluate(registry, evidence, policy = {}) {
			const minimumFixtures = policy.minimumFixturesPerAdapter ?? 1;
			const minimumContractFixtures = policy.minimumContractFixturesPerAdapter ?? 0;
			const minimumRealRepositoryFixtures = policy.minimumRealRepositoryFixturesPerAdapter ?? 0;
			const requiredCapabilities = policy.requiredCapabilities ?? [];
			const requiredCapabilitiesPerAdapter = policy.requiredCapabilitiesPerAdapter ?? [];
			const excludedAdapters = new Set(policy.excludedAdapters ?? []);
			const entries = registry.adapters.map((adapter): AdapterCoverageEntry => {
				const adapterEvidence = evidence.filter((item) => item.adapter === adapter.id);
				const capabilities = countBy(adapterEvidence.flatMap((item) => item.capabilities));
				return {
					adapter: adapter.id,
					fixtures: adapterEvidence.length,
					contractFixtures: adapterEvidence.filter(
						(item) => item.kind === AdapterCoverageEvidenceKindTag.Contract,
					).length,
					realRepositoryFixtures: adapterEvidence.filter(
						(item) => item.kind === AdapterCoverageEvidenceKindTag.RealRepository,
					).length,
					browserFixtures: adapterEvidence.filter(
						(item) => item.kind === AdapterCoverageEvidenceKindTag.Browser,
					).length,
					capabilities,
					proof: passedProofDimensions(adapterEvidence),
				};
			});
			const capabilityTotals = countBy(evidence.flatMap((item) => item.capabilities));
			const proofTotals = passedProofDimensions(evidence);
			const failures: AdapterCoverageFailure[] = [];
			for (const entry of entries) {
				if (excludedAdapters.has(entry.adapter)) continue;
				if (entry.fixtures < minimumFixtures)
					failures.push({
						adapter: entry.adapter,
						message: `requires at least ${minimumFixtures} fixture(s), found ${entry.fixtures}`,
					});
				if (entry.contractFixtures < minimumContractFixtures)
					failures.push({
						adapter: entry.adapter,
						message: `requires at least ${minimumContractFixtures} direct contract fixture(s), found ${entry.contractFixtures}`,
					});
				if (entry.realRepositoryFixtures < minimumRealRepositoryFixtures)
					failures.push({
						adapter: entry.adapter,
						message: `requires at least ${minimumRealRepositoryFixtures} real-repository fixture(s), found ${entry.realRepositoryFixtures}`,
					});
				for (const capability of requiredCapabilitiesPerAdapter) {
					if ((entry.capabilities[capability] ?? 0) === 0)
						failures.push({
							adapter: entry.adapter,
							capability,
							message: `required capability ${capability} has no direct evidence for ${entry.adapter}`,
						});
				}
				for (const dimension of policy.requiredProofDimensionsByAdapter?.[entry.adapter] ?? []) {
					if ((entry.proof[dimension] ?? 0) === 0)
						failures.push({
							adapter: entry.adapter,
							dimension,
							message: `required production proof dimension ${dimension} has no passing evidence for ${entry.adapter}`,
						});
				}
			}
			for (const capability of requiredCapabilities) {
				if ((capabilityTotals[capability] ?? 0) === 0)
					failures.push({
						capability,
						message: `required capability ${capability} has no evidence`,
					});
			}
			return {
				schema: ADAPTER_COVERAGE_SCHEMA,
				entries,
				capabilityTotals,
				proofTotals,
				failures,
				passed: failures.length === 0,
			};
		},
	};
}
