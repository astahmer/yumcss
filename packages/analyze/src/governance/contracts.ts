/**
 * Token governance contracts (plans/054) — the versioned, neutral report
 * shape shared by the analyzer, Inspector/Studio, the lint plugin, and the
 * tokenization codemod. Tooling only: nothing here touches the frozen
 * runtime API surface.
 *
 * Safety posture (plan decisions log):
 * - unknown is always explicit; a zero-use claim requires proven
 *   reachability, never absence of evidence;
 * - suggestions require exact, property/theme/scope-aware matches and are
 *   rejected when ambiguous;
 * - removal is classified (safe / review / not-removable) and stays
 *   report-first; patches are read-only until write mode is requested.
 */

/** Serialized report contract version. Bump on breaking shape changes. */
export const TOKEN_GOVERNANCE_REPORT_VERSION = 1;

/** How strongly a governance fact is proven. */
export type GovernanceConfidence = "verified" | "inferred" | "unknown";

/**
 * Why a definitive usage claim is impossible. Every boundary that blocks a
 * "dead token" conclusion must be named here; nothing else may downgrade
 * unused candidates silently.
 */
export type GovernanceCoverageBoundary =
	| "dynamic-expression"
	| "runtime-theme-access"
	| "generated-css"
	| "public-export"
	| "safelist"
	| "plugin-output"
	| "unscanned-file"
	| "configuration-failure"
	| "unresolved-import";

/** Where a token definition was discovered. */
export type TokenDefinitionSource =
	| "official-config"
	| "imported-css"
	| "interop-artifact"
	| "declared-format";

/** Governance view of the existing token-graph tiers. */
export type TokenDefinitionLayer = "raw" | "semantic" | "scope" | "component";

/** One provenance record for a definition or usage fact. */
export interface GovernanceProvenance {
	readonly source: TokenDefinitionSource;
	/** Project-relative file, when the fact came from a file. */
	readonly file?: string;
	/** Loader/adapter that produced the fact (for example "pandwind"). */
	readonly origin?: string;
	/** Human-readable detail (config path, artifact path, import chain). */
	readonly detail?: string;
}

/**
 * A single token definition in the effective universe. Conditional values
 * stay scoped (scopedValues) — never flattened into invented token names.
 */
export interface TokenDefinition {
	/** Canonical identity: group + "::" + name. */
	readonly id: string;
	readonly group: string;
	readonly name: string;
	readonly layer: TokenDefinitionLayer;
	/** Statically resolved scalar value, when unconditionally defined. */
	readonly value?: string;
	/** Theme/condition-scoped re-bindings (scope or theme key -> value). */
	readonly scopedValues?: Readonly<Record<string, string>>;
	/** Authored aliases that resolve to this definition. */
	readonly aliases?: readonly string[];
	readonly provenance: readonly GovernanceProvenance[];
	/** Theme keys this definition participates in, when known. */
	readonly themes?: readonly string[];
}

/** What kind of site observed a token. */
export type TokenUsageKind =
	| "direct"
	| "alias"
	| "semantic"
	| "recipe"
	| "css-variable"
	| "generated"
	| "exported-reference";

/** Strictness of an observed value (plan "Classify strict and raw values"). */
export type TokenStrictness =
	| "token"
	| "raw-allowed"
	| "raw-strict-violation"
	| "unknown"
	| "dynamic";

/** One observed token usage with position and confidence. */
export interface TokenUsage {
	readonly tokenId: string;
	readonly kind: TokenUsageKind;
	/** Project-relative file containing the usage. */
	readonly file: string;
	/** 0-based offsets into file. */
	readonly start: number;
	readonly end: number;
	readonly property?: string;
	/** Condition path the usage sits under (for example "hover" or "dark"). */
	readonly condition?: string;
	readonly theme?: string;
	/** Authored raw literal, when the usage is a raw value (tokenId is ""). */
	readonly rawValue?: string;
	readonly strictness: TokenStrictness;
	readonly confidence: GovernanceConfidence;
}

/**
 * Effective strict-token policy snapshot. resolved=false means the policy
 * could not be evaluated — every strictness in the report must then be
 * "unknown" (report-only, fail-open). Pandwind never invents strictness
 * from a guessed preset.
 */
export interface TokenPolicySnapshot {
	readonly owner: string;
	readonly resolved: boolean;
	readonly allowedRawValues?: readonly string[];
	readonly allowedRawPrefixes?: readonly string[];
	/** Properties that require tokens; literals there are strict violations. */
	readonly strictProperties?: readonly string[];
	/** Per-property raw escape hatches (literal values the project declared). */
	readonly allowedRawValuesByProperty?: Readonly<Record<string, readonly string[]>>;
	/**
	 * Per-property token vocabulary (official config): authored name ->
	 * canonical token id (or "$name" authored form when the group is
	 * ambiguous). A value matching its property's vocabulary is a verified
	 * token reference even without a $ prefix.
	 */
	readonly tokenVocabulary?: Readonly<Record<string, Readonly<Record<string, string>>>>;
	readonly origin?: string;
}

/** An exact raw-literal -> token suggestion. */
export interface RawTokenSuggestion {
	readonly file: string;
	readonly start: number;
	readonly end: number;
	readonly property?: string;
	readonly rawValue: string;
	/** Suggested canonical token id (group + "::" + name). */
	readonly tokenId: string;
	/** Authored spelling to emit (for example "$colors.red-500"). */
	readonly replacement: string;
	readonly reason: string;
	readonly confidence: GovernanceConfidence;
}

/** Removal safety classification for a zero-use definition. */
export type RemovalSafety = "safe-to-remove" | "review-required" | "not-removable";

export interface UnusedTokenCandidate {
	readonly tokenId: string;
	readonly safety: RemovalSafety;
	/** Why this classification holds (boundary names, export sites, ...). */
	readonly reasons: readonly string[];
	/** Coverage boundaries that prevent a stronger claim. */
	readonly boundaries: readonly GovernanceCoverageBoundary[];
}

export interface GovernanceDiagnostic {
	readonly severity: "error" | "warning" | "info";
	readonly code: string;
	readonly message: string;
	readonly file?: string;
	readonly boundary?: GovernanceCoverageBoundary;
}

export interface TokenGovernanceSummary {
	readonly defined: number;
	readonly used: number;
	readonly unusedCandidates: number;
	readonly safeToRemove: number;
	readonly reviewRequired: number;
	readonly notRemovable: number;
	readonly strictViolations: number;
	readonly rawAllowed: number;
	readonly unknownStrictness: number;
	readonly suggestions: number;
	readonly boundaries: Readonly<Record<GovernanceCoverageBoundary, number>>;
}

/** The full versioned governance report. */
export interface TokenGovernanceReport {
	readonly version: typeof TOKEN_GOVERNANCE_REPORT_VERSION;
	readonly generatedAt: string;
	/** Project root the report was computed for. */
	readonly root: string;
	readonly definitions: readonly TokenDefinition[];
	readonly usage: readonly TokenUsage[];
	readonly policy: TokenPolicySnapshot | null;
	readonly suggestions: readonly RawTokenSuggestion[];
	readonly unusedCandidates: readonly UnusedTokenCandidate[];
	readonly diagnostics: readonly GovernanceDiagnostic[];
	readonly summary: TokenGovernanceSummary;
}
