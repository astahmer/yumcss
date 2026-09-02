import type { AdapterDependencies, AdapterProjectConfig } from "./adapter-contract.ts";
import {
	AdapterConfigEvidenceSourceTag,
	AdapterEvidenceStatusTag,
	AdapterOfficialApiStatusTag,
	AdapterPluginResolutionTag,
} from "./identifiers.ts";

/** Versioned documentation and project-evidence contract for one adapter. */
export const ADAPTER_EVIDENCE_SCHEMA = "pandwind.style-adapter-evidence/1" as const;

export interface AdapterOfficialApi {
	readonly name: string;
	readonly status: AdapterOfficialApiStatusTag;
	readonly forms?: readonly string[];
}

export interface AdapterOfficialApiManifest {
	readonly schema: typeof ADAPTER_EVIDENCE_SCHEMA;
	readonly apis: readonly AdapterOfficialApi[];
	readonly configEntrypoints: readonly string[];
	readonly pluginSystems: readonly string[];
	readonly compilerIntegrations: readonly string[];
	readonly ssrHooks: readonly string[];
}

export interface AdapterConfigEvidence {
	readonly source: AdapterConfigEvidenceSourceTag;
	readonly status: AdapterEvidenceStatusTag;
	readonly paths?: readonly string[];
	readonly packages?: readonly string[];
	readonly detail?: string;
}

export interface AdapterPluginEvidence {
	readonly name: string;
	readonly resolution: AdapterPluginResolutionTag;
	readonly packageName?: string;
	readonly detail?: string;
}

export interface AdapterPluginChain {
	readonly plugins: readonly AdapterPluginEvidence[];
	readonly complete: boolean;
}

export interface AdapterGeneratedArtifactEvidence {
	readonly path: string;
	readonly kind: string;
	readonly authoritative: boolean;
	readonly detail?: string;
}

export interface AdapterEvidenceProfile {
	readonly officialApi: AdapterOfficialApiManifest;
	readonly configuration: readonly AdapterConfigEvidence[];
	readonly plugins: AdapterPluginChain;
	readonly artifacts: readonly AdapterGeneratedArtifactEvidence[];
}

export type AdapterOfficialApiManifestInput = {
	readonly apis: readonly AdapterOfficialApi[];
	readonly configEntrypoints?: readonly string[];
	readonly pluginSystems?: readonly string[];
	readonly compilerIntegrations?: readonly string[];
	readonly ssrHooks?: readonly string[];
};

/** Adapter-local additions that keep the recognized API list derived from its patterns. */
export type AdapterOfficialApiManifestOptions = Omit<AdapterOfficialApiManifestInput, "apis"> & {
	readonly apis?: readonly AdapterOfficialApi[];
};

type AdapterLike = {
	readonly sourceModules: readonly string[];
	readonly dependencies: AdapterDependencies;
	readonly officialApi?: AdapterOfficialApiManifest;
};

/** Scoped constructor/normalizer for adapter evidence; no ecosystem logic lives here. */
export class AdapterEvidence {
	static manifest(input: AdapterOfficialApiManifestInput): AdapterOfficialApiManifest {
		return {
			schema: ADAPTER_EVIDENCE_SCHEMA,
			apis: input.apis,
			configEntrypoints: input.configEntrypoints ?? [],
			pluginSystems: input.pluginSystems ?? [],
			compilerIntegrations: input.compilerIntegrations ?? [],
			ssrHooks: input.ssrHooks ?? [],
		};
	}

	static defaultManifest(input: {
		readonly patterns: readonly {
			readonly name: string;
			readonly form?: string;
			readonly kind?: string;
			readonly residual?: unknown;
		}[];
		readonly configFiles?: readonly string[];
		readonly sourceModules: readonly string[];
	}): AdapterOfficialApiManifest {
		return AdapterEvidence.manifest({
			apis: input.patterns.map((pattern) => ({
				name: pattern.name,
				status:
					pattern.form === "residual" || pattern.residual !== undefined
						? AdapterOfficialApiStatusTag.CompatibilityOnly
						: AdapterOfficialApiStatusTag.Supported,
				forms: [pattern.form ?? pattern.kind ?? "style"],
			})),
			configEntrypoints: input.configFiles,
			compilerIntegrations: input.sourceModules,
		});
	}

	static normalizeConfig(
		config: AdapterProjectConfig,
		fallback: readonly AdapterConfigEvidence[] = [],
	): AdapterProjectConfig {
		const values = config.values;
		const existing = config.configuration;
		if (existing !== undefined && existing.length > 0) return config;

		const officialPackages = [
			values.officialConfigPackage,
			...(Array.isArray(values.officialConfigPackages) ? values.officialConfigPackages : []),
		].filter((value): value is string => typeof value === "string");
		const officialError =
			typeof values.officialConfigError === "string" ? values.officialConfigError : undefined;
		const artifacts = AdapterEvidence.artifactsFrom(config);
		const evidence: AdapterConfigEvidence[] = [...fallback];
		if (officialPackages.length > 0) {
			evidence.unshift({
				source: AdapterConfigEvidenceSourceTag.OfficialLoader,
				status:
					officialError === undefined
						? AdapterEvidenceStatusTag.Resolved
						: AdapterEvidenceStatusTag.Failed,
				packages: officialPackages,
				...(officialError === undefined ? {} : { detail: officialError }),
			});
		}
		if (artifacts.length > 0) {
			evidence.push({
				source: AdapterConfigEvidenceSourceTag.GeneratedArtifact,
				status: AdapterEvidenceStatusTag.Resolved,
				paths: artifacts.map((artifact) => artifact.path),
			});
		}
		if (evidence.length === 0) {
			evidence.push({
				source: AdapterConfigEvidenceSourceTag.ProjectSourceFallback,
				status:
					config.files.length > 0
						? AdapterEvidenceStatusTag.Resolved
						: AdapterEvidenceStatusTag.NotAttempted,
				paths: config.files,
			});
		}
		if (config.residuals?.some((residual) => residual.kind === "configuration") === true) {
			evidence.push({
				source: AdapterConfigEvidenceSourceTag.Unresolved,
				status: AdapterEvidenceStatusTag.Failed,
				detail: "configuration residual requires review",
			});
		}
		const plugins = AdapterEvidence.pluginsFrom(config);
		return {
			...config,
			configuration: evidence,
			artifacts,
			...(config.plugins !== undefined ||
			config.values.plugins !== undefined ||
			config.values.plugin !== undefined
				? { plugins }
				: {}),
		};
	}

	static pluginsFrom(config: AdapterProjectConfig): AdapterPluginChain {
		if (config.plugins !== undefined) return config.plugins;
		const raw = config.values.plugins ?? config.values.plugin;
		if (!Array.isArray(raw)) return { plugins: [], complete: true };
		return {
			plugins: raw.map((plugin, index) => ({
				name: typeof plugin === "string" ? plugin : `configured-plugin-${index + 1}`,
				resolution:
					typeof plugin === "string"
						? AdapterPluginResolutionTag.Resolved
						: AdapterPluginResolutionTag.Unresolved,
				...(typeof plugin === "string"
					? { packageName: plugin }
					: { detail: "plugin value was not statically identified" }),
			})),
			complete: raw.every((plugin) => typeof plugin === "string"),
		};
	}

	static profile(adapter: AdapterLike): AdapterEvidenceProfile {
		return {
			officialApi:
				adapter.officialApi ??
				AdapterEvidence.manifest({
					apis: [],
					compilerIntegrations: adapter.sourceModules,
				}),
			configuration: [],
			plugins: { plugins: [], complete: true },
			artifacts: [],
		};
	}

	private static artifactsFrom(
		config: AdapterProjectConfig,
	): readonly AdapterGeneratedArtifactEvidence[] {
		if (config.artifacts !== undefined) return config.artifacts;
		return config.files
			.filter((file) => /(?:interop|generated|styled-system)/u.test(file))
			.map((path) => ({
				path,
				kind: "generated-style-artifact",
				authoritative: true,
			}));
	}
}
