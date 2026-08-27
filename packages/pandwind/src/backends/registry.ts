import { createCssBackend, type CssBackendOptions } from "./css.ts";
import { createObjectBackend, type ObjectBackend, type ObjectBackendOptions } from "./object.ts";
import { createOpentuiBackend, type OpentuiBackendOptions } from "./opentui.ts";
import { createRnBackend, type RnBackendOptions } from "./react-native.ts";
import type { StyleBackend } from "./types.ts";

/** Versioned target-backend factory contract. */
export const STYLE_BACKEND_SCHEMA = "pandwind.style-backend/1" as const;

export type BuiltinBackendId = "css" | "object" | "react-native" | "opentui";

export interface StyleBackendFactory<TOptions = unknown, TArtifact = unknown> {
	readonly schema: typeof STYLE_BACKEND_SCHEMA;
	readonly id: string;
	readonly capabilities?: readonly string[];
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
		create(id, options) {
			const factory = factories.get(id);
			if (factory === undefined) throw new Error(`unknown style backend: ${id}`);
			return factory.create(options) as StyleBackend<TArtifact>;
		},
	};
	for (const factory of initial) registry.register(factory);
	return registry;
}

const factory = <TOptions, TArtifact>(
	id: string,
	create: (options?: TOptions) => StyleBackend<TArtifact>,
	capabilities: readonly string[],
): StyleBackendFactory<TOptions, TArtifact> => ({
	schema: STYLE_BACKEND_SCHEMA,
	id,
	capabilities,
	create,
});

export const STYLE_BACKEND_FACTORIES: readonly StyleBackendFactory[] = [
	factory<CssBackendOptions, string>("css", (options) => createCssBackend(options), [
		"atomic-css",
		"stylesheet",
	]),
	factory<ObjectBackendOptions, Record<string, unknown>>(
		"object",
		(options) => {
			if (options === undefined) throw new Error("pandwind/object: options.name is required");
			return createObjectBackend(options);
		},
		["style-object", "runtime-conditions"],
	),
	factory<RnBackendOptions, Record<string, unknown>>(
		"react-native",
		(options) => createRnBackend(options),
		["style-object", "runtime-conditions", "unitless-lengths"],
	),
	factory<OpentuiBackendOptions, Record<string, unknown>>(
		"opentui",
		(options) => createOpentuiBackend(options),
		["style-object", "runtime-conditions", "terminal-cells"],
	),
];

/** Built-in registry; applications may derive a fresh registry and register more targets. */
export const STYLE_BACKENDS: StyleBackendRegistry =
	createStyleBackendRegistry(STYLE_BACKEND_FACTORIES);
