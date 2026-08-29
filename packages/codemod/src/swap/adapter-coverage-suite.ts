import { requiredAdapterCapabilities } from "./capabilities.ts";
import type { AdapterContractProbe } from "./adapter-contract-suite.ts";
import type { StyleAdapter } from "./adapter-contract.ts";
import type { StyleAdapterRegistry } from "./adapter-registry.ts";

export interface AdapterCoverageProbe extends AdapterContractProbe {
	readonly expectedMatches?: number;
}

export interface AdapterCoverageFailure {
	readonly adapter: string;
	readonly check: "fixture" | "capability" | "dependency";
	readonly message: string;
}

export interface AdapterCoverageReport {
	readonly adapter: string;
	readonly matches: number;
	readonly exercisedCapabilities: readonly string[];
	readonly failures: readonly AdapterCoverageFailure[];
	readonly valid: boolean;
}

/**
 * Registry-level gate for meaningful adapter coverage. A line-coverage
 * percentage cannot tell us whether a newly registered adapter understands
 * the semantics its fixture actually exercises; this gate can.
 */
// oxlint-disable-next-line typescript/no-extraneous-class -- scoped coverage policy
export class AdapterCoverageSuite {
	static inspect(adapter: StyleAdapter, probe: AdapterCoverageProbe): AdapterCoverageReport {
		const file = probe.file ?? "fixture.tsx";
		const source = probe.source ?? "";
		const failures: AdapterCoverageFailure[] = [];
		const fail = (check: AdapterCoverageFailure["check"], message: string): void => {
			failures.push({ adapter: adapter.id, check, message });
		};
		if (adapter.dependencies.packages.length === 0) {
			fail("dependency", "adapter must declare at least one owned dependency");
		}
		try {
			const config = adapter.loadConfig({ file, source });
			const parsed = adapter.parse(source, { file, source, config });
			if (parsed.matches.length === 0) fail("fixture", "fixture produced no adapter match");
			if (probe.expectedMatches !== undefined && parsed.matches.length !== probe.expectedMatches)
				fail(
					"fixture",
					`expected ${probe.expectedMatches} match(es), received ${parsed.matches.length}`,
				);
			const exercised = new Set<string>();
			for (const match of parsed.matches) {
				for (const requirement of requiredAdapterCapabilities(match.program)) {
					exercised.add(requirement.capability);
					const level = adapter.capabilities.capabilities[requirement.capability];
					if (level === undefined || level === "unsupported")
						fail(
							"capability",
							`${requirement.capability} is exercised by the fixture but not supported`,
						);
				}
			}
			return {
				adapter: adapter.id,
				matches: parsed.matches.length,
				exercisedCapabilities: [...exercised].toSorted(),
				failures,
				valid: failures.length === 0,
			};
		} catch (error) {
			fail("fixture", error instanceof Error ? error.message : "adapter fixture threw");
			return {
				adapter: adapter.id,
				matches: 0,
				exercisedCapabilities: [],
				failures,
				valid: false,
			};
		}
	}

	static inspectRegistry(
		registry: Pick<StyleAdapterRegistry, "adapters">,
		probes: ReadonlyMap<string, AdapterCoverageProbe>,
	): readonly AdapterCoverageReport[] {
		return registry.adapters.map((adapter) => {
			const probe = probes.get(adapter.id);
			return probe === undefined
				? {
						adapter: adapter.id,
						matches: 0,
						exercisedCapabilities: [],
						failures: [
							{
								adapter: adapter.id,
								check: "fixture",
								message: "registered adapter has no coverage probe",
							},
						],
						valid: false,
					}
				: this.inspect(adapter, probe);
		});
	}

	static assert(report: AdapterCoverageReport): void {
		if (!report.valid)
			throw new Error(
				`${report.adapter} adapter coverage failed: ${report.failures
					.map((failure) => `${failure.check}: ${failure.message}`)
					.join("; ")}`,
			);
	}
}
