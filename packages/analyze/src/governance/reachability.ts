/**
 * Reachability + removal classification (plans/054 step 7).
 *
 * A definition is an unused CANDIDATE only when no usage fact references it
 * after alias resolution. Classification is deliberately conservative:
 * - any coverage boundary touching the token (public export, plugin,
 *   generated CSS, dynamic access, ...) => review-required;
 * - an unresolved configuration (loader failure) => nothing is removable;
 * - plain zero-use with verified provenance => safe-to-remove;
 * - css-var definitions are never auto-removable (cascade ownership),
 *   they are at most review-required.
 */
import type {
	GovernanceCoverageBoundary,
	GovernanceDiagnostic,
	TokenDefinition,
	TokenUsage,
	UnusedTokenCandidate,
} from "./contracts.ts";

export interface ReachabilityInputs {
	readonly definitions: readonly TokenDefinition[];
	readonly usage: readonly TokenUsage[];
	/** Token ids hit by each boundary (dynamic/export/plugin/generated...). */
	readonly boundaryHits?: Readonly<Partial<Record<GovernanceCoverageBoundary, readonly string[]>>>;
	/** True when any configuration source failed to load. */
	readonly configurationIncomplete?: boolean;
}

export interface ReachabilityOutcome {
	readonly candidates: readonly UnusedTokenCandidate[];
	readonly diagnostics: readonly GovernanceDiagnostic[];
}

export function classifyReachability(inputs: ReachabilityInputs): ReachabilityOutcome {
	const usedIds = new Set(inputs.usage.map((u) => u.tokenId).filter((id) => id !== ""));
	const boundaryHits = inputs.boundaryHits ?? {};
	const diagnostics: GovernanceDiagnostic[] = [];
	const candidates: UnusedTokenCandidate[] = [];

	for (const def of inputs.definitions) {
		if (usedIds.has(def.id)) continue;
		const boundaries: GovernanceCoverageBoundary[] = [];
		const reasons: string[] = [];
		for (const boundary of Object.keys(boundaryHits) as GovernanceCoverageBoundary[]) {
			const hits = boundaryHits[boundary] ?? [];
			if (!hits.includes(def.id) && !hits.includes(def.name) && !hits.includes("*")) continue;
			boundaries.push(boundary);
		}
		// A boundary hit by file-level events (dynamic sites carry file names)
		// downgrades every candidate to review-required when unscoped.
		let safety: UnusedTokenCandidate["safety"] = "safe-to-remove";
		if (def.group === "css-var") {
			safety = "review-required";
			reasons.push("css custom property — cascade ownership is outside the scanned graph");
		}
		if (boundaries.length > 0) {
			safety = "review-required";
			reasons.push(...boundaries.map((b) => "coverage boundary: " + b));
		}
		if (inputs.configurationIncomplete === true) {
			safety = "review-required";
			reasons.push("configuration incomplete — usage claims are unproven");
		}
		if (def.provenance.some((p) => p.source === "interop-artifact")) {
			safety = "review-required";
			reasons.push("defined by generated interop artifact — regeneration owns removal");
		}
		candidates.push({ tokenId: def.id, safety, reasons, boundaries });
	}

	if (inputs.configurationIncomplete === true) {
		diagnostics.push({
			severity: "warning",
			code: "governance/config-incomplete",
			message: "configuration incomplete — unused classification is report-only",
			boundary: "configuration-failure",
		});
	}
	return { candidates, diagnostics };
}
