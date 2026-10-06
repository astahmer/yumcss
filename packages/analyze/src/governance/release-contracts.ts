import type {
	TokenDocument,
	TokenJsonValue,
	TokenValue,
} from "@yumcss/codemod/swap/token-document";
import type {
	GovernanceCoverageBoundary,
	RawTokenSuggestion,
	RemovalSafety,
	TokenGovernanceReport,
	TokenUsage,
} from "./contracts.ts";

export const TOKEN_RELEASE_REPORT_SCHEMA = "yumcss.token-release/1" as const;

export const TokenReleaseChangeKind = {
	Added: "added",
	Removed: "removed",
	ValueChanged: "value-changed",
	TypeChanged: "type-changed",
	ContextChanged: "context-changed",
	DeprecationChanged: "deprecation-changed",
	MetadataChanged: "metadata-changed",
} as const;

export type TokenReleaseChangeKindValue =
	(typeof TokenReleaseChangeKind)[keyof typeof TokenReleaseChangeKind];

export type TokenReleaseChangeKind = TokenReleaseChangeKindValue;

export const TOKEN_RELEASE_CHANGE_KINDS: readonly TokenReleaseChangeKind[] = [
	TokenReleaseChangeKind.Added,
	TokenReleaseChangeKind.Removed,
	TokenReleaseChangeKind.ValueChanged,
	TokenReleaseChangeKind.TypeChanged,
	TokenReleaseChangeKind.ContextChanged,
	TokenReleaseChangeKind.DeprecationChanged,
	TokenReleaseChangeKind.MetadataChanged,
];

export interface TokenReleaseTokenState {
	readonly value: TokenValue;
	readonly hasContextualValues?: true;
	readonly type?: string;
	readonly deprecated?: boolean | string;
	readonly description?: string;
	readonly extensions?: Readonly<Record<string, TokenJsonValue>>;
}

export interface TokenReleaseChange {
	/** RFC 6901 pointer into the token document or its resolver. */
	readonly path: string;
	readonly kind: TokenReleaseChangeKind;
	readonly before?: TokenReleaseTokenState | TokenJsonValue;
	readonly after?: TokenReleaseTokenState | TokenJsonValue;
	/** Present only for a token path matched exactly to governance definitions. */
	readonly tokenIds: readonly string[];
	/** Reference spellings authored by the before/after token values. */
	readonly references: readonly string[];
	readonly changedFields?: readonly string[];
	readonly consumers: readonly TokenReleaseConsumerImpact[];
}

export interface TokenReleaseConsumerImpact {
	readonly root: string;
	readonly tokenIds: readonly string[];
	readonly usages: readonly TokenUsage[];
	readonly exactSuggestions: readonly RawTokenSuggestion[];
	readonly removal?: {
		readonly safety: RemovalSafety;
		readonly reasons: readonly string[];
		readonly boundaries: readonly GovernanceCoverageBoundary[];
	};
	/** Report-wide boundary counts remain visible where no exact token attribution exists. */
	readonly coverageBoundaries: Readonly<Record<GovernanceCoverageBoundary, number>>;
}

export interface TokenReleaseReport {
	readonly schema: typeof TOKEN_RELEASE_REPORT_SCHEMA;
	readonly baseline: Pick<TokenDocument, "format" | "formatVersion" | "sourceFingerprint">;
	readonly current: Pick<TokenDocument, "format" | "formatVersion" | "sourceFingerprint">;
	readonly generatedAt: string;
	readonly changes: readonly TokenReleaseChange[];
	readonly summary: Readonly<Record<TokenReleaseChangeKind, number>>;
	readonly consumerRoots: readonly string[];
}

export interface TokenReleaseComparisonInputs {
	readonly baseline: TokenDocument;
	readonly current: TokenDocument;
	readonly consumers: readonly TokenGovernanceReport[];
	readonly generatedAt?: string;
}
