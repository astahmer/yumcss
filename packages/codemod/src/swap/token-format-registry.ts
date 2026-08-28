import type { TokenFormatAdapter, TokenFormatRegistry } from "./token-format-contracts.ts";
export class DefaultTokenFormatRegistry implements TokenFormatRegistry {
	private readonly entries = new Map<string, TokenFormatAdapter>();
	constructor(initial: readonly TokenFormatAdapter[] = []) {
		for (const adapter of initial) this.register(adapter);
	}
	get adapters(): readonly TokenFormatAdapter[] {
		return [...this.entries.values()];
	}
	register(adapter: TokenFormatAdapter): TokenFormatRegistry {
		if (adapter.schema !== "pandwind.token-format/1") {
			throw new Error(`unsupported token format schema: ${adapter.schema}`);
		}
		if (this.entries.has(adapter.id))
			throw new Error(`token format already registered: ${adapter.id}`);
		this.entries.set(adapter.id, adapter);
		return this;
	}
	get(id: string): TokenFormatAdapter | undefined {
		return this.entries.get(id);
	}
}
