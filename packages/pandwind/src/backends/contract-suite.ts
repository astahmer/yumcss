import { STYLE_BACKEND_SCHEMA, type StyleBackendFactory } from "./registry.ts";
import { BuiltinBackendId } from "./backend-identifiers.ts";

export interface BackendContractProbe {
	readonly options?: unknown;
}

export interface BackendContractReport {
	readonly backend: string;
	readonly failures: readonly string[];
	readonly valid: boolean;
}

/** Generic substitution suite shared by built-in and third-party backends. */
export class BackendContractSuite {
	static inspect(
		factory: StyleBackendFactory,
		probe: BackendContractProbe = {},
	): BackendContractReport {
		const failures: string[] = [];
		if (factory.schema !== STYLE_BACKEND_SCHEMA) failures.push("invalid backend schema");
		if (factory.id.trim() === "") failures.push("backend id is empty");
		if (factory.capabilities.features.declarations === undefined)
			failures.push("declaration capability is missing");
		try {
			const options =
				probe.options ?? (factory.id === BuiltinBackendId.Object ? { name: factory.id } : undefined);
			const backend = factory.create(options);
			if (backend.name.trim() === "") failures.push("backend name is empty");
			backend.declare("color", "red");
		} catch (error) {
			failures.push(error instanceof Error ? error.message : "backend lifecycle threw");
		}
		return { backend: factory.id, failures, valid: failures.length === 0 };
	}

	static assert(report: BackendContractReport): void {
		if (!report.valid) throw new Error(`${report.backend} backend contract failed: ${report.failures.join("; ")}`);
	}
}
