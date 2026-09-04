/**
 * Deterministic prune proposal (plans/054 step 7) — reviewable .changeset
 * content derived from a governance report. Only safe-to-remove candidates
 * are listed: review-required entries carry unproven boundaries and must go
 * through human review first. Read-only generation — callers decide whether
 * to write the file.
 */
import type { TokenGovernanceReport, UnusedTokenCandidate } from "./contracts.ts";

export interface GovernancePruneChangeset {
	readonly count: number;
	/** .changeset markdown content; null when nothing is safely removable. */
	readonly content: string | null;
}

/** Authored spelling for a canonical id (colors::red-500 -> $colors.red-500). */
export function authoredTokenSpelling(tokenId: string): string {
	const separator = tokenId.indexOf("::");
	if (separator === -1) return tokenId;
	return "$" + tokenId.slice(0, separator) + "." + tokenId.slice(separator + 2);
}

export function buildGovernancePruneChangeset(
	report: Pick<TokenGovernanceReport, "unusedCandidates">,
	appLabel = "app",
): GovernancePruneChangeset {
	const safe = report.unusedCandidates
		.filter((candidate: UnusedTokenCandidate) => candidate.safety === "safe-to-remove")
		.map((candidate) => candidate.tokenId)
		.toSorted();
	if (safe.length === 0) return { count: 0, content: null };
	const list = safe.map((id) => "- `" + authoredTokenSpelling(id) + "` (" + id + ")").join("\n");
	return {
		count: safe.length,
		content: [
			"---",
			'"pandwind": patch',
			"---",
			"",
			"Remove " + safe.length + " unused design token(s) from the " + appLabel + " preset",
			"",
			"Safe-to-remove tokens (zero reachable usage, no coverage boundaries) per the token governance report:",
			"",
			list,
			"",
		].join("\n"),
	};
}
