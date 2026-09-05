import type { StyleAdapter } from "./adapter-contract.ts";
import { ADAPTER_CONTRACT_SCHEMA } from "./adapter-contract.ts";
import {
	createStyleAdapterManifest,
	readAdapterPackageDeclaration,
	type StyleAdapterManifest,
	validateStyleAdapterManifest,
} from "./adapter-manifest.ts";
import {
	asStyleDialect,
	createStyleSystem,
	createStyleSystemRegistry,
	type StyleSystemAdapter,
	type StyleSystemRegistry,
} from "./style-systems.ts";
import {
	createAdapterCapabilityMatrix,
	type AdapterCapabilityMatrix,
	type AdapterCapabilityMatrixEntry,
} from "./capabilities.ts";
import { PANDA_STYLE_SYSTEM, PANDWIND_STYLE_SYSTEM } from "./adapters/core.adapter.ts";
import { CodemodAdapterId } from "./identifiers.ts";
import {
	projectDynamicClassMigration,
	projectPortableDynamicMigration,
	projectStaticSubjectMigration,
} from "./adapter-projections.ts";
import { PortableStyleArtifact } from "./portable-artifact.ts";
import { StyleRepresentationKind } from "./identifiers.ts";

/** Versioned package contract for third-party adapter discovery. */
export const ADAPTER_PLUGIN_SCHEMA = "pandwind.style-adapter-plugin/1" as const;

export interface StyleAdapterPlugin {
	readonly schema: typeof ADAPTER_PLUGIN_SCHEMA;
	readonly id: string;
	readonly version?: string;
	readonly manifest: StyleAdapterManifest;
	readonly adapters: readonly StyleAdapter[];
}

export interface AdapterDiscoveryResult {
	readonly specifier: string;
	readonly registered: readonly string[];
	readonly errors: readonly string[];
}

export interface AdapterDiscoveryOptions {
	/** Injectable loader makes discovery deterministic in tests and bundlers. */
	readonly load?: (specifier: string) => Promise<unknown>;
	/** Injectable package metadata loader for dependency-based discovery. */
	readonly loadPackageJson?: (
		specifier: string,
	) => Promise<Readonly<Record<string, unknown>> | undefined>;
}

export interface StyleAdapterRegistry {
	readonly adapters: readonly StyleAdapter[];
	register(adapter: StyleAdapter): StyleAdapterRegistry;
	registerPlugin(plugin: StyleAdapterPlugin): StyleAdapterRegistry;
	get(id: string): StyleAdapter | undefined;
	capabilityMatrix(): AdapterCapabilityMatrix;
	toStyleSystemRegistry(): StyleSystemRegistry;
	discover(
		specifiers: readonly string[],
		options?: AdapterDiscoveryOptions,
	): Promise<readonly AdapterDiscoveryResult[]>;
	discoverPackages(
		packageJson: Readonly<Record<string, unknown>>,
		options?: AdapterDiscoveryOptions,
	): Promise<readonly AdapterDiscoveryResult[]>;
}

const NORMALIZED_ADAPTER = Symbol("pandwind.normalized-adapter");

function asPlugin(value: unknown, specifier: string): StyleAdapterPlugin {
	const candidate = (value as { default?: unknown }).default ?? value;
	if (isStyleAdapter(candidate)) {
		return createStyleAdapterPlugin(specifier, [candidate]);
	}
	if (
		typeof candidate === "object" &&
		candidate !== null &&
		(candidate as { schema?: unknown }).schema === ADAPTER_PLUGIN_SCHEMA
	) {
		return candidate as StyleAdapterPlugin;
	}
	if (typeof candidate === "object" && candidate !== null) {
		const adapters = (candidate as { adapters?: unknown }).adapters;
		if (Array.isArray(adapters) && adapters.every(isStyleAdapter))
			return createStyleAdapterPlugin(specifier, adapters);
	}
	throw new Error(`package ${specifier} does not export a pandwind adapter plugin`);
}

function isStyleAdapter(value: unknown): value is StyleAdapter {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as { schema?: unknown }).schema === ADAPTER_CONTRACT_SCHEMA &&
		typeof (value as { id?: unknown }).id === "string" &&
		typeof (value as { parse?: unknown }).parse === "function" &&
		typeof (value as { emit?: unknown }).emit === "function"
	);
}

function normalizeAdapter(adapter: StyleAdapter): StyleAdapter {
	if (
		(adapter as StyleAdapter & { readonly [NORMALIZED_ADAPTER]?: true })[NORMALIZED_ADAPTER] ===
		true
	)
		return adapter;
	// Common host projections are composed at the registry boundary so a target
	// adapter only declares its carrier contract. The migration runner remains
	// unaware of which concrete ecosystem implements that carrier.
	const migration = projectPortableDynamicMigration(
		projectDynamicClassMigration(adapter.id, projectStaticSubjectMigration(adapter.migration)),
		adapter.capabilities,
	);
	const normalized: StyleAdapter = {
		...adapter,
		migration,
		emit: (program, context) => {
			if (
				context.host?.representationKind === StyleRepresentationKind.PortableArtifact &&
				!program.rules.some((rule) => rule.name !== undefined)
			) {
				const portableProgram = PortableStyleArtifact.restoreDynamicValues(
					program,
					context.loweringResiduals ?? [],
				);
				const dynamic = PortableStyleArtifact.containsDynamicValues(portableProgram);
				return {
					text: dynamic
						? `css.vars(${PortableStyleArtifact.objectText(portableProgram)})`
						: `css.class(${PortableStyleArtifact.objectText(portableProgram)})`,
					imports: dynamic
						? [
								'import { createRuntimeCss } from "pandwind/css/runtime";',
								'import { pandwindPreset } from "pandwind/preset";',
								'const css = createRuntimeCss(pandwindPreset) as import("pandwind/css").CssFn & { sheet: import("pandwind/css/runtime").RuntimeSheet };',
							]
						: ['import { createCss } from "pandwind/css";', "const css = createCss();"],
					semantic: portableProgram,
					dependencies: { packages: [{ name: "pandwind", kind: "runtime" }] },
					residuals: [],
				};
			}
			return adapter.emit(program, context);
		},
	};
	Object.defineProperty(normalized, NORMALIZED_ADAPTER, { value: true });
	return normalized;
}

export function createStyleAdapterPlugin(
	id: string,
	adapters: readonly StyleAdapter[],
	version = "1",
): StyleAdapterPlugin {
	if (adapters.length === 0) throw new Error(`adapter plugin ${id} must export an adapter`);
	return {
		schema: ADAPTER_PLUGIN_SCHEMA,
		id,
		version,
		manifest: createStyleAdapterManifest(id, version, adapters),
		adapters,
	};
}

export function createStyleAdapterRegistry(
	initial: readonly StyleAdapter[] = [],
): StyleAdapterRegistry {
	const values = new Map<string, StyleAdapter>();
	const registry: StyleAdapterRegistry = {
		get adapters() {
			return [...values.values()];
		},
		register(adapter) {
			if (!isStyleAdapter(adapter)) throw new Error("invalid style adapter");
			const normalized = normalizeAdapter(adapter);
			if (values.has(normalized.id))
				throw new Error(`style adapter already registered: ${normalized.id}`);
			values.set(normalized.id, normalized);
			return registry;
		},
		registerPlugin(plugin) {
			if (plugin.schema !== ADAPTER_PLUGIN_SCHEMA)
				throw new Error(`unsupported adapter plugin schema: ${plugin.schema}`);
			validateStyleAdapterManifest(plugin.manifest, plugin.adapters);
			for (const adapter of plugin.adapters) registry.register(adapter);
			return registry;
		},
		get: (id) => values.get(id),
		capabilityMatrix: () =>
			createAdapterCapabilityMatrix(
				registry.adapters.map((adapter): AdapterCapabilityMatrixEntry => ({
					...adapter.capabilities,
					sourceModules: adapter.sourceModules,
					dependencies: adapter.dependencies,
				})),
			),
		toStyleSystemRegistry() {
			const adapters = registry.adapters;
			const panda = adapters.find((adapter) => adapter.id === CodemodAdapterId.Panda);
			const pandwind = adapters.find((adapter) => adapter.id === CodemodAdapterId.Pandwind);
			const systems: StyleSystemAdapter[] = [
				createStyleSystem(CodemodAdapterId.Panda, [
					...(panda === undefined
						? []
						: [asStyleDialect(panda, { system: CodemodAdapterId.Panda, dialect: panda.id })]),
					...PANDA_STYLE_SYSTEM.dialects,
				]),
				createStyleSystem(CodemodAdapterId.Pandwind, [
					...(pandwind === undefined
						? []
						: [
								asStyleDialect(pandwind, {
									system: CodemodAdapterId.Pandwind,
									dialect: pandwind.id,
								}),
							]),
					...PANDWIND_STYLE_SYSTEM.dialects,
				]),
				...adapters
					.filter(
						(adapter) =>
							adapter.id !== CodemodAdapterId.Panda && adapter.id !== CodemodAdapterId.Pandwind,
					)
					.map((adapter) =>
						createStyleSystem(adapter.id, [
							asStyleDialect(adapter, { system: adapter.id, dialect: adapter.id, role: "both" }),
						]),
					),
			];
			return createStyleSystemRegistry(systems);
		},
		async discover(specifiers, options = {}) {
			const load = options.load ?? ((specifier: string) => import(/* @vite-ignore */ specifier));
			return Promise.all(
				specifiers.map(async (specifier): Promise<AdapterDiscoveryResult> => {
					try {
						const plugin = asPlugin(await load(specifier), specifier);
						registry.registerPlugin(plugin);
						return {
							specifier,
							registered: plugin.adapters.map((adapter) => adapter.id),
							errors: [],
						};
					} catch (error) {
						return {
							specifier,
							registered: [],
							errors: [error instanceof Error ? error.message : String(error)],
						};
					}
				}),
			);
		},
		async discoverPackages(packageJson, options = {}) {
			const dependencies = [
				packageJson.dependencies,
				packageJson.devDependencies,
				packageJson.peerDependencies,
			]
				.flatMap((value) =>
					value !== null && typeof value === "object"
						? Object.keys(value as Record<string, unknown>)
						: [],
				)
				.toSorted();
			const loadPackageJson =
				options.loadPackageJson ??
				(async (specifier: string) => {
					try {
						const loaded = await import(/* @vite-ignore */ `${specifier}/package.json`, {
							with: { type: "json" },
						});
						return (loaded.default ?? loaded) as Readonly<Record<string, unknown>>;
					} catch {
						return undefined;
					}
				});
			const candidates = (
				await Promise.all(
					dependencies.map(async (specifier) => ({
						specifier,
						metadata: await loadPackageJson(specifier),
					})),
				)
			)
				.filter(({ metadata }) => readAdapterPackageDeclaration(metadata ?? {}) !== undefined)
				.map(({ specifier }) => specifier);
			return registry.discover(candidates, options);
		},
	};
	for (const adapter of initial) registry.register(adapter);
	return registry;
}
