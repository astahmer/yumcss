import type { RuntimeRule } from "./runtime-artifacts.ts";

/** Canonicalizes runtime artifacts before they enter a serializer or sink. */
export interface RuntimeRuleCanonicalizer {
	canonicalize(rule: RuntimeRule): RuntimeRule;
}

/** Defines deterministic ordering for runtime artifacts. */
export interface RuntimeOrderingPolicy {
	order(rules: Iterable<RuntimeRule>): RuntimeRule[];
}

class IdentityRuntimeRuleCanonicalizer implements RuntimeRuleCanonicalizer {
	canonicalize(rule: RuntimeRule): RuntimeRule {
		return rule;
	}
}

class PriorityRuntimeOrderingPolicy implements RuntimeOrderingPolicy {
	order(rules: Iterable<RuntimeRule>): RuntimeRule[] {
		return Array.from(rules).toSorted(
			(a, b) => a.priority - b.priority || a.id.localeCompare(b.id),
		);
	}
}

export const createRuntimeRuleCanonicalizer = (): RuntimeRuleCanonicalizer =>
	new IdentityRuntimeRuleCanonicalizer();

export const createRuntimeOrderingPolicy = (): RuntimeOrderingPolicy =>
	new PriorityRuntimeOrderingPolicy();
