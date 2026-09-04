/**
 * Token governance (plans/054) — neutral, versioned report shared by the
 * analyzer, Inspector/Studio, the lint plugin, and the codemod planners.
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
