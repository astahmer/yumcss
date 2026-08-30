import type { StyleAdapter } from "./adapter-contract.ts";
import type { StyleAdapterRegistry } from "./adapter-registry.ts";
import { ADAPTER_CAPABILITIES_SCHEMA } from "./capabilities.ts";
import { ADAPTER_CONTRACT_SCHEMA, ADAPTER_CONTRACT_VERSION } from "./adapter-contract.ts";

export interface AdapterContractProbe {
	readonly file?: string;
	readonly source?: string;
}

export interface AdapterContractFailure {
	readonly adapter: string;
	readonly check: string;
	readonly message: string;
}

export interface AdapterContractReport {
	readonly adapter: string;
	readonly failures: readonly AdapterContractFailure[];
	readonly valid: boolean;
}

/**
 * Generic adapter conformance boundary. It deliberately knows nothing about
 * an ecosystem: a new adapter gets the same identity, config, parse, emit,
 * and validation checks as every built-in adapter.
 */
// oxlint-disable-next-line typescript/no-extraneous-class -- scoped contract policy
export class AdapterContractSuite {
	static inspect(adapter: StyleAdapter, probe: AdapterContractProbe = {}): AdapterContractReport {
		const file = probe.file ?? "fixture.tsx";
		const source = probe.source ?? "";
		const failures: AdapterContractFailure[] = [];
		const fail = (check: string, message: string): void => {
			failures.push({ adapter: adapter.id, check, message });
		};

		if (adapter.schema !== ADAPTER_CONTRACT_SCHEMA)
			fail("schema", `expected ${ADAPTER_CONTRACT_SCHEMA}, received ${adapter.schema}`);
		if (adapter.version !== ADAPTER_CONTRACT_VERSION)
			fail("version", `expected v${ADAPTER_CONTRACT_VERSION}, received ${adapter.version}`);
		if (adapter.id.trim() === "") fail("identity", "adapter id must not be empty");
		// Host-only adapters (for example Chakra, MUI, and Mantine) can own
		// syntax without owning an import that is safe to remove.
		if (adapter.capabilities.schema !== ADAPTER_CAPABILITIES_SCHEMA)
			fail("capabilities", "capability contract has an unknown schema");
		if (adapter.capabilities.adapter !== adapter.id)
			fail("capabilities", "capability contract does not belong to the adapter");

		try {
			const config = adapter.loadConfig({ file, source });
			const parsed = adapter.parse(source, { file, source, config });
			if (!Array.isArray(parsed.matches)) fail("parse", "parse result matches must be an array");
			if (!Array.isArray(parsed.residuals))
				fail("parse", "parse result residuals must be an array");
			for (const match of parsed.matches) {
				const emitted = adapter.emit(match.program, {
					file,
					config,
					mode: "safe",
					capability: {
						adapter: adapter.id,
						convertible: true,
						blockers: [],
						mode: "safe",
						requirements: [],
						exact: [],
						partial: [],
						unsupported: [],
					},
					index: 0,
				});
				if (typeof emitted.text !== "string") fail("emit", "emission text must be a string");
				const validation = adapter.validate(match.program, match.program);
				if (typeof validation.valid !== "boolean")
					fail("validate", "validation must report valid boolean");
			}
		} catch (error) {
			fail("lifecycle", error instanceof Error ? error.message : "adapter lifecycle threw");
		}
		return { adapter: adapter.id, failures, valid: failures.length === 0 };
	}

	static inspectRegistry(
		registry: Pick<StyleAdapterRegistry, "adapters">,
		probe: AdapterContractProbe = {},
	): readonly AdapterContractReport[] {
		return registry.adapters.map((adapter) => this.inspect(adapter, probe));
	}

	static assert(report: AdapterContractReport): void {
		if (!report.valid)
			throw new Error(
				`${report.adapter} adapter contract failed: ${report.failures
					.map((failure) => `${failure.check}: ${failure.message}`)
					.join("; ")}`,
			);
	}
}
