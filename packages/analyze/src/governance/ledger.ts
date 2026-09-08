/**
 * Token governance ledger (plans/054) — canonical identity, deduplication,
 * and deterministic ordering over the neutral governance contracts.
 *
 * The ledger is the only place governance facts are merged: definitions from
 * multiple provenance sources collapse by canonical id while retaining every
 * provenance record; usage facts dedupe on (tokenId, file, range, kind,
 * property) with the strongest strictness/confidence kept; and all emitted
 * lists are sorted so reports are stable across runs.
 */
import {
	type GovernanceCoverageBoundary,
	type GovernanceDiagnostic,
	type RawTokenSuggestion,
	type TokenDefinition,
	type TokenGovernanceSummary,
	type TokenUsage,
	type TokenUsageKind,
	type UnusedTokenCandidate,
} from "./contracts.ts";

/** Canonical definition id: group::name. */
export const tokenId = (group: string, name: string): string => `${group}::${name}`;

const USAGE_KIND_ORDER: Record<TokenUsageKind, number> = {
	direct: 0,
	alias: 1,
	semantic: 2,
	recipe: 3,
	"css-variable": 4,
	generated: 5,
	"exported-reference": 6,
};

const CONFIDENCE_RANK = { verified: 0, inferred: 1, unknown: 2 } as const;

const STRICTNESS_RANK = {
	token: 0,
	"raw-allowed": 1,
	"raw-strict-violation": 2,
	dynamic: 3,
	unknown: 4,
} as const;

/** More-proven facts sort first (lower is stronger). */
export const compareUsage = (a: TokenUsage, b: TokenUsage): number =>
	CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence] ||
	STRICTNESS_RANK[a.strictness] - STRICTNESS_RANK[b.strictness] ||
	USAGE_KIND_ORDER[a.kind] - USAGE_KIND_ORDER[b.kind];

/** Merge two provenance lists, dropping exact duplicates, order-preserving. */
const mergeProvenance = (
	a: TokenDefinition["provenance"],
	b: TokenDefinition["provenance"],
): TokenDefinition["provenance"] => {
	const seen = new Set(a.map((p) => JSON.stringify([p.source, p.file, p.origin, p.detail])));
	return [
		...a,
		...b.filter((p) => !seen.has(JSON.stringify([p.source, p.file, p.origin, p.detail]))),
	];
};

/** Fold an incoming definition into an existing ledger entry. */
export const mergeDefinition = (
	existing: TokenDefinition,
	incoming: TokenDefinition,
): TokenDefinition => ({
	id: existing.id,
	group: existing.group,
	name: existing.name,
	layer:
		incoming.layer === "semantic" || existing.layer === "semantic" ? "semantic" : existing.layer,
	value: existing.value ?? incoming.value,
	scopedValues: mergeScoped(existing.scopedValues, incoming.scopedValues),
	aliases: mergeAliases(existing.aliases, incoming.aliases),
	provenance: mergeProvenance(existing.provenance, incoming.provenance),
	themes: mergeStrings(existing.themes, incoming.themes),
});

const mergeScoped = (
	a?: Readonly<Record<string, string>>,
	b?: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> | undefined => {
	if (a === undefined) return b;
	if (b === undefined) return a;
	return { ...a, ...b };
};

const mergeAliases = (
	a?: readonly string[],
	b?: readonly string[],
): readonly string[] | undefined => {
	if (a === undefined && b === undefined) return undefined;
	return mergeStrings(a ?? [], b ?? []);
};

const mergeStrings = (
	a?: readonly string[],
	b?: readonly string[],
): readonly string[] | undefined => {
	const set = new Set([...(a ?? []), ...(b ?? [])]);
	if (set.size === 0) return undefined;
	return [...set].toSorted((x, y) => x.localeCompare(y));
};

/** Deterministic usage identity for deduplication. */
export const usageKey = (u: TokenUsage): string =>
	[u.tokenId, u.file, u.start, u.end, u.kind, u.property ?? "", u.theme ?? ""].join("\u0000");

/** Deterministic suggestion identity for deduplication. */
export const suggestionKey = (s: RawTokenSuggestion): string =>
	[s.file, s.start, s.end, s.property ?? "", s.tokenId].join("\u0000");

export const ALL_BOUNDARIES: GovernanceCoverageBoundary[] = [
	"dynamic-expression",
	"runtime-theme-access",
	"generated-css",
	"public-export",
	"safelist",
	"plugin-output",
	"unscanned-file",
	"configuration-failure",
	"unresolved-import",
];

/** Build the deterministic summary block of the report. */
export function buildSummary(
	definitions: readonly TokenDefinition[],
	usage: readonly TokenUsage[],
	suggestions: readonly RawTokenSuggestion[],
	candidates: readonly UnusedTokenCandidate[],
	boundaryHits: Readonly<Record<GovernanceCoverageBoundary, readonly string[]>>,
): TokenGovernanceSummary {
	const usedIds = new Set(usage.map((u) => u.tokenId));
	const boundaries = Object.fromEntries(
		ALL_BOUNDARIES.map((b) => [b, boundaryHits[b]?.length ?? 0]),
	) as TokenGovernanceSummary["boundaries"];
	return {
		defined: definitions.length,
		used: usedIds.size,
		unusedCandidates: candidates.length,
		safeToRemove: candidates.filter((c) => c.safety === "safe-to-remove").length,
		reviewRequired: candidates.filter((c) => c.safety === "review-required").length,
		notRemovable: candidates.filter((c) => c.safety === "not-removable").length,
		strictViolations: usage.filter((u) => u.strictness === "raw-strict-violation").length,
		rawAllowed: usage.filter((u) => u.strictness === "raw-allowed").length,
		unknownStrictness: usage.filter((u) => u.strictness === "unknown").length,
		suggestions: suggestions.length,
		boundaries,
	};
}
