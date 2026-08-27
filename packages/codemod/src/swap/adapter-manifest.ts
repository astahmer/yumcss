import type { AdapterCapabilityLevel } from "./capabilities.ts";
import {
	ADAPTER_CONTRACT_SCHEMA,
	type AdapterDependencies,
	type StyleAdapter,
} from "./adapter-contract.ts";

/** Package metadata convention consumed before an adapter is registered. */
export const ADAPTER_MANIFEST_SCHEMA = "pandwind.style-adapter-manifest/1" as const;
export const ADAPTER_PACKAGE_FIELD = "pandwind" as const;

export interface StyleAdapterManifestEntry {
	readonly id: string;
	readonly version: string;
	readonly contract: typeof ADAPTER_CONTRACT_SCHEMA;
	readonly capabilities: Readonly<Partial<Record<string, AdapterCapabilityLevel>>>;
	readonly dependencies: AdapterDependencies;
}

export interface StyleAdapterManifest {
	readonly schema: typeof ADAPTER_MANIFEST_SCHEMA;
	readonly packageName: string;
	readonly packageVersion: string;
	readonly adapters: readonly StyleAdapterManifestEntry[];
}

export interface AdapterPackageDeclaration {
	readonly plugin?: string;
	readonly manifest?: string;
}

export function createStyleAdapterManifest(
	packageName: string,
	packageVersion: string,
	adapters: readonly StyleAdapter[],
): StyleAdapterManifest {
	return {
		schema: ADAPTER_MANIFEST_SCHEMA,
		packageName,
		packageVersion,
		adapters: adapters.map((adapter) => ({
			id: adapter.id,
			version: adapter.version,
			contract: ADAPTER_CONTRACT_SCHEMA,
			capabilities: adapter.capabilities.capabilities,
			dependencies: adapter.dependencies,
		})),
	};
}

export function readAdapterPackageDeclaration(
	packageJson: Readonly<Record<string, unknown>>,
): AdapterPackageDeclaration | undefined {
	const declaration = packageJson[ADAPTER_PACKAGE_FIELD];
	if (typeof declaration !== "object" || declaration === null) return undefined;
	const value = declaration as { plugin?: unknown; manifest?: unknown };
	return {
		...(typeof value.plugin === "string" ? { plugin: value.plugin } : {}),
		...(typeof value.manifest === "string" ? { manifest: value.manifest } : {}),
	};
}

export function validateStyleAdapterManifest(
	manifest: StyleAdapterManifest,
	adapters: readonly StyleAdapter[],
): void {
	if (manifest.schema !== ADAPTER_MANIFEST_SCHEMA)
		throw new Error(`unsupported adapter manifest schema: ${manifest.schema}`);
	if (manifest.adapters.length !== adapters.length)
		throw new Error(`adapter manifest count does not match package ${manifest.packageName}`);
	for (const adapter of adapters) {
		const entry = manifest.adapters.find((candidate) => candidate.id === adapter.id);
		if (entry === undefined) throw new Error(`adapter manifest is missing ${adapter.id}`);
		if (entry.contract !== ADAPTER_CONTRACT_SCHEMA)
			throw new Error(`adapter ${adapter.id} requires unsupported contract ${entry.contract}`);
		if (entry.version !== adapter.version)
			throw new Error(`adapter ${adapter.id} manifest version does not match implementation`);
	}
}
