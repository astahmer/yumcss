import type { AdapterCapabilityLevel } from "./capabilities.ts";
import {
	ADAPTER_CONTRACT_SCHEMA,
	type AdapterDependencies,
	type StyleAdapter,
} from "./adapter-contract.ts";
import {
	StyleProgramCompatibility,
	type StyleProgramCoreRequirement,
} from "./style-program-core.ts";
import type { AdapterOfficialApiManifest } from "./adapter-evidence.ts";

/** Package metadata convention consumed before an adapter is registered. */
export const ADAPTER_MANIFEST_SCHEMA = "pandwind.style-adapter-manifest/2" as const;
export const ADAPTER_PACKAGE_FIELD = "pandwind" as const;

export interface StyleAdapterManifestEntry {
	readonly id: string;
	readonly version: string;
	readonly contract: typeof ADAPTER_CONTRACT_SCHEMA;
	readonly capabilities: Readonly<Partial<Record<string, AdapterCapabilityLevel>>>;
	readonly dependencies: AdapterDependencies;
	readonly officialApi: AdapterOfficialApiManifest;
}

export interface StyleAdapterManifest {
	readonly schema: typeof ADAPTER_MANIFEST_SCHEMA;
	readonly packageName: string;
	readonly packageVersion: string;
	readonly core: StyleProgramCoreRequirement;
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
		core: StyleProgramCompatibility.current(),
		adapters: adapters.map((adapter) => ({
			id: adapter.id,
			version: adapter.version,
			contract: ADAPTER_CONTRACT_SCHEMA,
			capabilities: adapter.capabilities.capabilities,
			dependencies: adapter.dependencies,
			officialApi: adapter.officialApi,
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
	const core = StyleProgramCompatibility.negotiate(manifest.core);
	if (!core.supported) throw new Error(core.reason ?? "adapter core compatibility check failed");
	if (manifest.adapters.length !== adapters.length)
		throw new Error(`adapter manifest count does not match package ${manifest.packageName}`);
	for (const adapter of adapters) {
		const entry = manifest.adapters.find((candidate) => candidate.id === adapter.id);
		if (entry === undefined) throw new Error(`adapter manifest is missing ${adapter.id}`);
		if (entry.contract !== ADAPTER_CONTRACT_SCHEMA)
			throw new Error(`adapter ${adapter.id} requires unsupported contract ${entry.contract}`);
		if (entry.version !== adapter.version)
			throw new Error(`adapter ${adapter.id} manifest version does not match implementation`);
		if (!sameCapabilities(entry.capabilities, adapter.capabilities.capabilities))
			throw new Error(`adapter ${adapter.id} manifest capabilities do not match implementation`);
		if (!sameOfficialApi(entry.officialApi, adapter.officialApi))
			throw new Error(`adapter ${adapter.id} manifest official API does not match implementation`);
	}
}

function sameCapabilities(
	left: Readonly<Record<string, unknown>>,
	right: Readonly<Record<string, unknown>>,
): boolean {
	const leftKeys = Object.keys(left).toSorted();
	const rightKeys = Object.keys(right).toSorted();
	return (
		leftKeys.length === rightKeys.length &&
		leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key])
	);
}

function sameOfficialApi(
	left: AdapterOfficialApiManifest,
	right: AdapterOfficialApiManifest,
): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}
