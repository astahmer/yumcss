import type { AdapterCapability } from "./capabilities.ts";
import type { StyleAdapterRegistry } from "./adapter-registry.ts";

/** Versioned evidence contract for adapter and capability coverage gates. */
export const ADAPTER_COVERAGE_SCHEMA = "pandwind.adapter-coverage/1" as const;

export type AdapterCoverageEvidenceKind = "contract" | "real-repository" | "browser";

export interface AdapterCoverageEvidence {
	readonly adapter: string;
	readonly fixture: string;
	readonly kind: AdapterCoverageEvidenceKind;
	readonly capabilities: readonly AdapterCapability[];
}

export interface AdapterCoveragePolicy {
	readonly minimumFixturesPerAdapter?: number;
	readonly minimumRealRepositoryFixturesPerAdapter?: number;
	readonly requiredCapabilities?: readonly AdapterCapability[];
}

export interface AdapterCoverageFailure {
	readonly adapter?: string;
	readonly capability?: AdapterCapability;
	readonly message: string;
}

export interface AdapterCoverageEntry {
	readonly adapter: string;
	readonly fixtures: number;
	readonly contractFixtures: number;
	readonly realRepositoryFixtures: number;
	readonly browserFixtures: number;
	readonly capabilities: Readonly<Partial<Record<AdapterCapability, number>>>;
}

export interface AdapterCoverageReport {
	readonly schema: typeof ADAPTER_COVERAGE_SCHEMA;
	readonly entries: readonly AdapterCoverageEntry[];
	readonly capabilityTotals: Readonly<Partial<Record<AdapterCapability, number>>>;
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

/**
 * Gate the evidence supplied by a composition root. The gate does not know
 * how fixtures are parsed or how browser proof is run; those are separate
 * ports. This keeps the policy reusable for third-party adapter registries.
 */
export function createAdapterCoverageGate(): AdapterCoverageGate {
	return {
		evaluate(registry, evidence, policy = {}) {
			const minimumFixtures = policy.minimumFixturesPerAdapter ?? 1;
			const minimumRealRepositoryFixtures = policy.minimumRealRepositoryFixturesPerAdapter ?? 0;
			const requiredCapabilities = policy.requiredCapabilities ?? [];
			const entries = registry.adapters.map((adapter): AdapterCoverageEntry => {
				const adapterEvidence = evidence.filter((item) => item.adapter === adapter.id);
				const capabilities = countBy(adapterEvidence.flatMap((item) => item.capabilities));
				return {
					adapter: adapter.id,
					fixtures: adapterEvidence.length,
					contractFixtures: adapterEvidence.filter((item) => item.kind === "contract").length,
					realRepositoryFixtures: adapterEvidence.filter((item) => item.kind === "real-repository")
						.length,
					browserFixtures: adapterEvidence.filter((item) => item.kind === "browser").length,
					capabilities,
				};
			});
			const capabilityTotals = countBy(evidence.flatMap((item) => item.capabilities));
			const failures: AdapterCoverageFailure[] = [];
			for (const entry of entries) {
				if (entry.fixtures < minimumFixtures)
					failures.push({
						adapter: entry.adapter,
						message: `requires at least ${minimumFixtures} fixture(s), found ${entry.fixtures}`,
					});
				if (entry.realRepositoryFixtures < minimumRealRepositoryFixtures)
					failures.push({
						adapter: entry.adapter,
						message: `requires at least ${minimumRealRepositoryFixtures} real-repository fixture(s), found ${entry.realRepositoryFixtures}`,
					});
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
				failures,
				passed: failures.length === 0,
			};
		},
	};
}
