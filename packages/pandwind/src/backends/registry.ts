import { BUILTIN_STYLE_BACKEND_PLUGINS } from "./plugin.ts";
import { STYLE_BACKEND_SCHEMA, type StyleBackend } from "./types.ts";
import type { BackendCapabilityContract } from "./types.ts";
import type { StyleBackendId } from "./types.ts";

export type { BuiltinBackendId, StyleBackendId } from "./types.ts";

export { STYLE_BACKEND_SCHEMA } from "./types.ts";

export interface StyleBackendFactory<TOptions = unknown, TArtifact = unknown> {
	readonly schema: typeof STYLE_BACKEND_SCHEMA;
	readonly id: StyleBackendId;
	readonly capabilities: BackendCapabilityContract;
	create(options?: TOptions): StyleBackend<TArtifact>;
}

export interface StyleBackendPlugin<
	TOptions = unknown,
	TArtifact = unknown,
> extends StyleBackendFactory<TOptions, TArtifact> {}

export interface StyleBackendRegistry {
	readonly plugins: readonly StyleBackendPlugin[];
	readonly factories: readonly StyleBackendFactory[];
	register(factory: StyleBackendFactory): StyleBackendRegistry;
	registerPlugin(plugin: StyleBackendPlugin): StyleBackendRegistry;
	get(id: StyleBackendId | string): StyleBackendFactory | undefined;
	create<TArtifact = unknown>(id: StyleBackendId | string, options?: unknown): StyleBackend<TArtifact>;
}

export function createStyleBackendRegistry(
	initial: readonly StyleBackendFactory[] = [],
): StyleBackendRegistry {
	const factories = new Map<string, StyleBackendFactory>();
	const registry: StyleBackendRegistry = {
		get plugins() {
			return [...factories.values()];
		},
		get factories() {
			return [...factories.values()];
		},
		register(factory) {
			return registry.registerPlugin(factory);
		},
		registerPlugin(plugin) {
			if (plugin.schema !== STYLE_BACKEND_SCHEMA)
				throw new Error(`unsupported style backend schema: ${plugin.schema}`);
			if (factories.has(plugin.id))
				throw new Error(`style backend already registered: ${plugin.id}`);
			factories.set(plugin.id, plugin);
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

/** Built-ins are composed here; individual adapters do not know the registry. */
export const STYLE_BACKEND_FACTORIES: readonly StyleBackendFactory[] =
	BUILTIN_STYLE_BACKEND_PLUGINS;

export const STYLE_BACKEND_PLUGINS: readonly StyleBackendPlugin[] = BUILTIN_STYLE_BACKEND_PLUGINS;

export const STYLE_BACKENDS: StyleBackendRegistry =
	createStyleBackendRegistry(STYLE_BACKEND_FACTORIES);
