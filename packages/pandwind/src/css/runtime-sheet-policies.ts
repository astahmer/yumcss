import type { RuntimeOrderingPolicy, RuntimeRule } from "./runtime-sheet-contracts.ts";

export class PriorityOrderingPolicy implements RuntimeOrderingPolicy {
	private compare(left: RuntimeRule, right: RuntimeRule): number {
		return left.priority - right.priority || left.id.localeCompare(right.id);
	}

	order(rules: ReadonlyMap<string, RuntimeRule>): RuntimeRule[] {
		return Array.from(rules.values()).toSorted((left, right) => this.compare(left, right));
	}

	insert(ordered: readonly RuntimeRule[], next: readonly RuntimeRule[]): RuntimeRule[] {
		const result = ordered.slice();
		for (const rule of next) {
			let low = 0;
			let high = result.length;
			while (low < high) {
				const middle = (low + high) >>> 1;
				if (this.compare(result[middle]!, rule) <= 0) low = middle + 1;
				else high = middle;
			}
			result.splice(low, 0, rule);
		}
		return result;
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
