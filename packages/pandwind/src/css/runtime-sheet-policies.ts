import type { RuntimeOrderingPolicy, RuntimeRule } from "./runtime-sheet-contracts.ts";

export class PriorityOrderingPolicy implements RuntimeOrderingPolicy {
	order(rules: ReadonlyMap<string, RuntimeRule>): RuntimeRule[] {
		return Array.from(rules.values()).toSorted((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
	}
}

export class RuntimeRuleStore {
	readonly rules = new Map<string, RuntimeRule>();

	register(next: readonly RuntimeRule[]): boolean {
		let changed = false;
		for (const rule of next) {
			const previous = this.rules.get(rule.id);
			if (previous?.css === rule.css && previous.priority === rule.priority) continue;
			this.rules.set(rule.id, rule);
			changed = true;
		}
		return changed;
	}

	replace(next: readonly RuntimeRule[]): void {
		this.rules.clear();
		for (const rule of next) this.rules.set(rule.id, rule);
	}
}
