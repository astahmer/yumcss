import type { AdapterCapability, AdapterCapabilityLevel } from "./capabilities.ts";
import type { StyleAdapterRegistry } from "./adapter-registry.ts";
import type { AdapterCoverageEvidence } from "./coverage-gate.ts";
import {
	AdapterCapabilityTag,
	AdapterCapabilityEvidenceStatusTag,
	RealRepositoryProofDimension,
	RealRepositoryProofDimensionStatus,
	StyleRepresentationKind,
} from "./identifiers.ts";
import { StyleDialectRoleTag } from "./style-systems.ts";

/** Versioned registry-derived ledger for adapter claims and their proof debt. */
export const ADAPTER_CAPABILITY_LEDGER_SCHEMA = "pandwind.adapter-capability-ledger/1" as const;

export interface AdapterCapabilityLedgerProof {
	readonly required: readonly RealRepositoryProofDimension[];
	readonly passed: readonly RealRepositoryProofDimension[];
}

export interface AdapterCapabilityLedgerEvidence {
	readonly status: AdapterCapabilityEvidenceStatusTag;
	readonly fixtures: number;
	readonly contractFixtures: number;
	readonly repositoryFixtures: number;
	readonly proof: AdapterCapabilityLedgerProof;
}

export interface AdapterCapabilityLedgerEntry {
	readonly adapter: string;
	readonly capability: AdapterCapability;
	readonly level: AdapterCapabilityLevel;
	readonly source: boolean;
	readonly target: boolean;
	/** Ordered representations the target can negotiate for this claim. */
	readonly representations: readonly StyleRepresentationKind[];
	readonly evidence: AdapterCapabilityLedgerEvidence;
}

export interface AdapterCapabilityLedger {
	readonly schema: typeof ADAPTER_CAPABILITY_LEDGER_SCHEMA;
	readonly entries: readonly AdapterCapabilityLedgerEntry[];
	get(adapter: string, capability: AdapterCapability): AdapterCapabilityLedgerEntry | undefined;
}

export interface CapabilityLedgerOptions {
	readonly evidence?: readonly AdapterCoverageEvidence[];
}

const REAL_PROOF_DIMENSIONS = [
	RealRepositoryProofDimension.CanonicalCss,
	RealRepositoryProofDimension.BrowserStates,
	RealRepositoryProofDimension.SsrHydration,
	RealRepositoryProofDimension.RscStreaming,
	RealRepositoryProofDimension.Dependencies,
	RealRepositoryProofDimension.CssSize,
] as const;

const STATIC_CAPABILITIES = new Set<AdapterCapability>([
	AdapterCapabilityTag.Declarations,
	AdapterCapabilityTag.TokenValues,
	AdapterCapabilityTag.NamedConditions,
	AdapterCapabilityTag.NamedRules,
	AdapterCapabilityTag.PseudoConditions,
	AdapterCapabilityTag.SelectorConditions,
	AdapterCapabilityTag.MediaConditions,
	AdapterCapabilityTag.ContainerConditions,
	AdapterCapabilityTag.SupportsConditions,
	AdapterCapabilityTag.RuleLevel,
	AdapterCapabilityTag.GlobalRules,
	AdapterCapabilityTag.Keyframes,
	AdapterCapabilityTag.FontFace,
	AdapterCapabilityTag.Layers,
	AdapterCapabilityTag.SupportsRules,
	AdapterCapabilityTag.PropertyRules,
	AdapterCapabilityTag.Selectors,
	AdapterCapabilityTag.Nesting,
	AdapterCapabilityTag.Ordering,
	AdapterCapabilityTag.Recipes,
	AdapterCapabilityTag.Composition,
]);

const requiresBrowserProof = new Set<AdapterCapability>([
	AdapterCapabilityTag.DynamicValues,
	AdapterCapabilityTag.FunctionValues,
	AdapterCapabilityTag.Components,
	AdapterCapabilityTag.HostFramework,
	AdapterCapabilityTag.ThemeContext,
	AdapterCapabilityTag.RuntimeContext,
	AdapterCapabilityTag.PluginTransforms,
	AdapterCapabilityTag.FrameworkSemantics,
	AdapterCapabilityTag.BrowserDifferential,
	AdapterCapabilityTag.Ssr,
	AdapterCapabilityTag.Hydration,
]);

const requiresSsrProof = new Set<AdapterCapability>([
	AdapterCapabilityTag.DynamicValues,
	AdapterCapabilityTag.FunctionValues,
	AdapterCapabilityTag.Components,
	AdapterCapabilityTag.RuntimeContext,
	AdapterCapabilityTag.Ssr,
	AdapterCapabilityTag.Hydration,
	AdapterCapabilityTag.FrameworkSemantics,
]);

function requiredProof(capability: AdapterCapability): readonly RealRepositoryProofDimension[] {
	const dimensions = new Set<RealRepositoryProofDimension>([
		RealRepositoryProofDimension.CanonicalCss,
		RealRepositoryProofDimension.Dependencies,
		RealRepositoryProofDimension.CssSize,
	]);
	if (requiresBrowserProof.has(capability))
		dimensions.add(RealRepositoryProofDimension.BrowserStates);
	if (requiresSsrProof.has(capability)) dimensions.add(RealRepositoryProofDimension.SsrHydration);
	return REAL_PROOF_DIMENSIONS.filter((dimension) => dimensions.has(dimension));
}

function representations(
	capability: AdapterCapability,
	level: AdapterCapabilityLevel,
): readonly StyleRepresentationKind[] {
	if (level === "unsupported") return [StyleRepresentationKind.Residual];
	if (STATIC_CAPABILITIES.has(capability))
		return level === "exact"
			? [StyleRepresentationKind.Static, StyleRepresentationKind.TargetNative]
			: [
					StyleRepresentationKind.Static,
					StyleRepresentationKind.TargetNative,
					StyleRepresentationKind.Residual,
				];
	if (
		capability === AdapterCapabilityTag.DynamicValues ||
		capability === AdapterCapabilityTag.FunctionValues
	)
		return [
			StyleRepresentationKind.Static,
			StyleRepresentationKind.CustomProperty,
			StyleRepresentationKind.RuntimeCarrier,
			StyleRepresentationKind.Residual,
		];
	if (
		capability === AdapterCapabilityTag.Components ||
		capability === AdapterCapabilityTag.HostFramework ||
		capability === AdapterCapabilityTag.FrameworkSemantics
	)
		return [
			StyleRepresentationKind.TargetNative,
			StyleRepresentationKind.RuntimeCarrier,
			StyleRepresentationKind.Residual,
		];
	return [
		StyleRepresentationKind.TargetNative,
		StyleRepresentationKind.Static,
		StyleRepresentationKind.Residual,
	];
}

function evidenceFor(
	adapter: string,
	capability: AdapterCapability,
	records: readonly AdapterCoverageEvidence[],
): AdapterCapabilityLedgerEvidence {
	const matching = records.filter(
		(record) => record.adapter === adapter && record.capabilities.includes(capability),
	);
	const contractFixtures = matching.filter((record) => record.kind === "contract").length;
	const repositoryFixtures = matching.filter((record) => record.kind === "real-repository").length;
	const passed = REAL_PROOF_DIMENSIONS.filter((dimension) =>
		matching.some(
			(record) => record.proof?.[dimension] === RealRepositoryProofDimensionStatus.Passed,
		),
	);
	const required = requiredProof(capability);
	const promoted =
		repositoryFixtures > 0 && required.every((dimension) => passed.includes(dimension));
	const status = promoted
		? AdapterCapabilityEvidenceStatusTag.Promoted
		: repositoryFixtures > 0
			? AdapterCapabilityEvidenceStatusTag.Repository
			: contractFixtures > 0
				? AdapterCapabilityEvidenceStatusTag.Fixture
				: AdapterCapabilityEvidenceStatusTag.Missing;
	return {
		status,
		fixtures: matching.length,
		contractFixtures,
		repositoryFixtures,
		proof: { required, passed },
	};
}

/**
 * Build the capability ledger from the registry and optional proof records.
 * The ledger has no adapter-name knowledge; adding a registry entry produces
 * its rows automatically and leaves missing evidence visible.
 */
export function createAdapterCapabilityLedger(
	registry: StyleAdapterRegistry,
	options: CapabilityLedgerOptions = {},
): AdapterCapabilityLedger {
	const evidence = options.evidence ?? [];
	const systems = registry.toStyleSystemRegistry();
	const entries = registry.adapters.flatMap((adapter) => {
		const dialect = systems.getDialect(adapter.id);
		const source = dialect?.role !== StyleDialectRoleTag.Target;
		const target = dialect?.role !== StyleDialectRoleTag.Source;
		return Object.entries(adapter.capabilities.capabilities).map(
			([capability, level]): AdapterCapabilityLedgerEntry => ({
				adapter: adapter.id,
				capability: capability as AdapterCapability,
				level: level as AdapterCapabilityLevel,
				source,
				target,
				representations: representations(
					capability as AdapterCapability,
					level as AdapterCapabilityLevel,
				),
				evidence: evidenceFor(adapter.id, capability as AdapterCapability, evidence),
			}),
		);
	});
	const byKey = new Map(entries.map((entry) => [`${entry.adapter}\0${entry.capability}`, entry]));
	return {
		schema: ADAPTER_CAPABILITY_LEDGER_SCHEMA,
		entries,
		get: (adapter, capability) => byKey.get(`${adapter}\0${capability}`),
	};
}
