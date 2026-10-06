import type { StyleBackendFactory, StyleBackendRegistry } from "./registry.ts";
import { STYLE_BACKEND_SCHEMA, type FlatStyleIR } from "./types.ts";

/** Contract version for backend substitution and representative-output tests. */
export const STYLE_BACKEND_CONTRACT_SCHEMA = "yumcss.style-backend-contract/1" as const;

export interface StyleBackendContractFixture {
	readonly backend: string;
	readonly options?: unknown;
	readonly declarations: FlatStyleIR;
}

export type StyleBackendContractPhase = "registration" | "creation" | "declaration";

export interface StyleBackendContractFailure {
	readonly backend: string;
	readonly phase: StyleBackendContractPhase;
	readonly message: string;
}

export interface StyleBackendContractResult {
	readonly schema: typeof STYLE_BACKEND_CONTRACT_SCHEMA;
	readonly valid: boolean;
	readonly checked: readonly string[];
	readonly failures: readonly StyleBackendContractFailure[];
}

export interface StyleBackendContractSuite {
	run(
		registry: StyleBackendRegistry,
		fixtures: readonly StyleBackendContractFixture[],
	): StyleBackendContractResult;
}

/**
 * Generic backend conformance suite. It deliberately knows nothing about CSS,
 * React Native, or OpenTUI: each backend supplies only construction options
 * and a representative declaration fixture through the composition root.
 */
export function createStyleBackendContractSuite(): StyleBackendContractSuite {
	return {
		run(registry, fixtures) {
			const byBackend = new Map(fixtures.map((fixture) => [fixture.backend, fixture]));
			const checked: string[] = [];
			const failures: StyleBackendContractFailure[] = [];
			for (const factory of registry.factories) {
				checked.push(factory.id);
				const fixture = byBackend.get(factory.id);
				if (fixture === undefined) {
					failures.push({
						backend: factory.id,
						phase: "registration",
						message: "backend has no contract fixture",
					});
					continue;
				}
				if (factory.schema !== STYLE_BACKEND_SCHEMA) {
					failures.push({
						backend: factory.id,
						phase: "registration",
						message: `unsupported backend schema: ${factory.schema}`,
					});
					continue;
				}
				let backend: ReturnType<StyleBackendFactory["create"]>;
				try {
					backend = factory.create(fixture.options);
				} catch (error) {
					failures.push({
						backend: factory.id,
						phase: "creation",
						message: error instanceof Error ? error.message : String(error),
					});
					continue;
				}
				for (const [key, value] of Object.entries(fixture.declarations)) {
					try {
						const first = backend.declare(key, value);
						const second = backend.declare(key, value);
						if (first !== second && JSON.stringify(first) !== JSON.stringify(second))
							throw new Error("declaration is not stable across repeated lowering");
					} catch (error) {
						failures.push({
							backend: factory.id,
							phase: "declaration",
							message: `${key}: ${error instanceof Error ? error.message : String(error)}`,
						});
					}
				}
			}
			return {
				schema: STYLE_BACKEND_CONTRACT_SCHEMA,
				valid: failures.length === 0,
				checked,
				failures,
			};
		},
	};
}
