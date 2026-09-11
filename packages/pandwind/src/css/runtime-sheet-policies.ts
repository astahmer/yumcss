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
	private readonly values = new Map<string, RuntimeRule>();

	get rules(): ReadonlyMap<string, RuntimeRule> {
		return this.values;
	}

	register(next: readonly RuntimeRule[]): boolean {
		if (!Array.isArray(next)) return false;
		let changed = false;
		for (const rule of next) {
			if (
				typeof rule?.id !== "string" ||
				rule.id.length === 0 ||
				typeof rule.css !== "string" ||
				rule.css.length === 0 ||
				rule.css.includes("\u0000") ||
				!Number.isFinite(rule.priority)
			)
				continue;
			const previous = this.values.get(rule.id);
			if (
				previous !== undefined &&
				previous.css === rule.css &&
				previous.priority === rule.priority
			)
				continue;
			this.values.set(rule.id, rule);
			changed = true;
		}
		return changed;
	}

	replace(next: readonly RuntimeRule[]): void {
		this.values.clear();
		if (!Array.isArray(next)) return;
		for (const rule of next) {
			if (
				typeof rule?.id !== "string" ||
				rule.id.length === 0 ||
				typeof rule.css !== "string" ||
				rule.css.length === 0 ||
				rule.css.includes("\u0000") ||
				!Number.isFinite(rule.priority)
			)
				continue;
			this.values.set(rule.id, rule);
		}
	}
}
