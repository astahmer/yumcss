/**
 * Token governance (plans/054) — neutral, versioned report shared by the
 * analyzer, Inspector/Migration Preview, the lint plugin, and the codemod planners.
 *
 * Entry points:
 * - contracts: the versioned report shape
 * - ledger: canonical identity + deterministic merge/order
 * - buildTokenGovernanceReport: assemble a report from collected facts
 */
export * from "./contracts.ts";
export { buildTokenGovernanceReport, type GovernanceInputs } from "./report.ts";
export {
	buildEffectiveTokenContext,
	type EffectiveTokenContext,
	type EffectiveTokenContextInputs,
} from "./effective-token-context.ts";
export {
	classifyReachability,
	type ReachabilityInputs,
	type ReachabilityOutcome,
} from "./reachability.ts";
export { scanPublicExports, type PublicExportHit } from "./public-export.ts";
export { suggestRawTokenReplacements, type SuggestionOutcome } from "./suggestions.ts";
export {
	collectTokenUsage,
	resolveUsageAgainstDefinitions,
	classifyStrictness,
	policySets,
	UNRESOLVED_TOKEN_ID,
	type UsageCollectionResult,
	type UsageCollectorFile,
} from "./usage-collector.ts";
export { analyzeTokenGovernance, type TokenGovernanceOptions } from "./service.ts";
export { compareTokenRelease } from "./release.ts";
export {
	TOKEN_RELEASE_CHANGE_KINDS,
	TOKEN_RELEASE_REPORT_SCHEMA,
	TokenReleaseChangeKind,
	type TokenReleaseChange,
	type TokenReleaseChangeKind as TokenReleaseChangeKindValue,
	type TokenReleaseComparisonInputs,
	type TokenReleaseConsumerImpact,
	type TokenReleaseReport,
} from "./release-contracts.ts";
export {
	deriveProjectGovernanceContext,
	DEFAULT_GOVERNANCE_PRESET,
	loadOfficialPresetModule,
	presetCandidates,
	projectGovernanceInputs,
	type DerivedProjectContext,
	type OfficialPresetLoad,
	type ProjectGovernanceInputs,
} from "./project-context.ts";
export {
	authoredTokenSpelling,
	buildGovernancePruneChangeset,
	type GovernancePruneChangeset,
} from "./prune-changeset.ts";
