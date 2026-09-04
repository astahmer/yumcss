/**
 * Report assembly (plans/054) — fold collected governance facts into one
 * deterministic, versioned TokenGovernanceReport.
 *
 * This module owns the merge/order invariants the contracts promise:
 * definitions dedupe by canonical id keeping all provenance, usage dedupes
 * by site identity keeping the strongest observation, suggestions dedupe by
 * site+target, and every emitted list is sorted for stable reports.
 */
import type {
	GovernanceCoverageBoundary,
	GovernanceDiagnostic,
	RawTokenSuggestion,
	TokenDefinition,
	TokenGovernanceReport,
	TokenUsage,
	UnusedTokenCandidate,
} from "./contracts.ts";
import { TOKEN_GOVERNANCE_REPORT_VERSION } from "./contracts.ts";
import {
	buildSummary,
	compareUsage,
	ALL_BOUNDARIES,
	mergeDefinition,
	suggestionKey,
	tokenId,
	usageKey,
} from "./ledger.ts";

export interface GovernanceInputs {
	readonly root: string;
	readonly generatedAt?: string;
	readonly definitions: readonly TokenDefinition[];
	readonly usage: readonly TokenUsage[];
	readonly suggestions: readonly RawTokenSuggestion[];
	readonly unusedCandidates: readonly UnusedTokenCandidate[];
	readonly diagnostics: readonly GovernanceDiagnostic[];
	/** Token ids touched per boundary (drives summary.boundaries counts). */
	readonly boundaryHits?: Readonly<Partial<Record<GovernanceCoverageBoundary, readonly string[]>>>;
}

const compareById = (a: { id: string }, b: { id: string }): number => a.id.localeCompare(b.id);

export function buildTokenGovernanceReport(inputs: GovernanceInputs): TokenGovernanceReport {
	// --- definitions: dedupe by canonical id, merge provenance/scopes/aliases.
	const byId = new Map<string, TokenDefinition>();
	for (const def of inputs.definitions) {
		const canonical = def.id === "" ? tokenId(def.group, def.name) : def.id;
		const normalized: TokenDefinition = { ...def, id: canonical };
		const existing = byId.get(canonical);
		byId.set(canonical, existing === undefined ? normalized : mergeDefinition(existing, normalized));
	}
	const definitions = [...byId.values()].toSorted(compareById);

	// --- usage: dedupe by site identity, keep the strongest observation.
	const usageById = new Map<string, TokenUsage>();
	for (const u of inputs.usage) {
		const key = usageKey(u);
		const existing = usageById.get(key);
		if (existing === undefined || compareUsage(u, existing) < 0) usageById.set(key, u);
	}
	const usage = [...usageById.values()].toSorted(
		(a, b) =>
			a.tokenId.localeCompare(b.tokenId) ||
			a.file.localeCompare(b.file) ||
			a.start - b.start ||
			a.end - b.end,
	);

	// --- suggestions: dedupe by site+target, stable order.
	const seenSuggestions = new Set<string>();
	const suggestions = inputs.suggestions
		.filter((s) => {
			const key = suggestionKey(s);
			if (seenSuggestions.has(key)) return false;
			seenSuggestions.add(key);
			return true;
		})
		.toSorted(
			(a, b) =>
				a.file.localeCompare(b.file) ||
				a.start - b.start ||
				a.end - b.end ||
				a.tokenId.localeCompare(b.tokenId),
		);

	// --- candidates: drop entries for definitions that were actually used or
	// don't exist; one entry per definition, most severe class last.
	const usedIds = new Set(usage.map((u) => u.tokenId));
	const knownIds = new Set(definitions.map((d) => d.id));
	const seenCandidates = new Set<string>();
	const unusedCandidates = inputs.unusedCandidates
		.filter((c) => !usedIds.has(c.tokenId) && knownIds.has(c.tokenId))
		.filter((c) => {
			if (seenCandidates.has(c.tokenId)) return false;
			seenCandidates.add(c.tokenId);
			return true;
		})
		.toSorted((a, b) => a.tokenId.localeCompare(b.tokenId));

	const diagnostics = inputs.diagnostics
		.slice()
		.toSorted(
			(a, b) =>
				a.severity.localeCompare(b.severity) ||
				a.code.localeCompare(b.code) ||
				a.message.localeCompare(b.message) ||
				(a.file ?? "").localeCompare(b.file ?? ""),
		);

	const boundaryHits = Object.fromEntries(
		ALL_BOUNDARIES.map((b) => [b, inputs.boundaryHits?.[b] ?? []]),
	) as Record<GovernanceCoverageBoundary, readonly string[]>;

	return {
		version: TOKEN_GOVERNANCE_REPORT_VERSION,
		generatedAt: inputs.generatedAt ?? new Date(0).toISOString(),
		root: inputs.root,
		definitions,
		usage,
		policy: null,
		suggestions,
		unusedCandidates,
		diagnostics,
		summary: buildSummary(definitions, usage, suggestions, unusedCandidates, boundaryHits),
	};
}
