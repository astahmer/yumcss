import { BUILTIN_STYLE_BACKEND_FACTORIES } from "./plugin.ts";
import { STYLE_BACKEND_SCHEMA, type StyleBackend, type StyleBackendId } from "./types.ts";
import type { BackendCapabilityContract } from "./types.ts";

export { STYLE_BACKEND_SCHEMA } from "./types.ts";

export interface StyleBackendFactory<TOptions = unknown, TArtifact = unknown> {
	readonly schema: typeof STYLE_BACKEND_SCHEMA;
	readonly id: string;
	readonly capabilities: BackendCapabilityContract;
	create(options?: TOptions): StyleBackend<TArtifact>;
}

export interface StyleBackendRegistry {
	readonly factories: readonly StyleBackendFactory[];
	register(factory: StyleBackendFactory): StyleBackendRegistry;
	get(id: string): StyleBackendFactory | undefined;
	create<TArtifact = unknown>(id: string, options?: unknown): StyleBackend<TArtifact>;
}

export function createStyleBackendRegistry(
	initial: readonly StyleBackendFactory[] = [],
): StyleBackendRegistry {
	const factories = new Map<string, StyleBackendFactory>();
	const registry: StyleBackendRegistry = {
		get factories() {
			return [...factories.values()];
		},
		register(factory) {
			if (factory.schema !== STYLE_BACKEND_SCHEMA)
				throw new Error(`unsupported style backend schema: ${factory.schema}`);
			if (factories.has(factory.id))
				throw new Error(`style backend already registered: ${factory.id}`);
			factories.set(factory.id, factory);
			return registry;
		},
		get: (id) => factories.get(id),
		create<TArtifact = unknown>(id: string, options?: unknown) {
			const factory = factories.get(id);
			if (factory === undefined) throw new Error(`unknown style backend: ${id}`);
			return factory.create(options) as StyleBackend<TArtifact>;
		},
	};
	for (const factory of initial) registry.register(factory);
	return registry;
}

export type BuiltinBackendId = StyleBackendId;

/** Built-ins are composed here; individual adapters do not know the registry. */
export const STYLE_BACKEND_FACTORIES: readonly StyleBackendFactory[] =
	BUILTIN_STYLE_BACKEND_FACTORIES;

export const STYLE_BACKENDS: StyleBackendRegistry =
	createStyleBackendRegistry(STYLE_BACKEND_FACTORIES);
