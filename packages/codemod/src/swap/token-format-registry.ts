import type { TokenFormatAdapter, TokenFormatId } from "./token-format.ts";
import { tokenFormatAdapters } from "./token-formats/index.ts";
import type { TokenSet } from "./token-set.ts";

export interface TokenFormatRegistry {
	register(adapter: TokenFormatAdapter): void;
	get(id: string): TokenFormatAdapter | undefined;
	importFile(id: string, path: string): Promise<TokenSet>;
	exportText(id: string, set: TokenSet): string;
}

class DefaultTokenFormatRegistry implements TokenFormatRegistry {
	private readonly adapters = new Map<TokenFormatId, TokenFormatAdapter>();

	constructor(adapters: readonly TokenFormatAdapter[] = tokenFormatAdapters) {
		for (const adapter of adapters) this.register(adapter);
	}

	register(adapter: TokenFormatAdapter): void {
		if (this.adapters.has(adapter.id)) throw new Error(`Duplicate token format '${adapter.id}'`);
		this.adapters.set(adapter.id, adapter);
	}

	get(id: string): TokenFormatAdapter | undefined {
		return this.adapters.get(id as TokenFormatId);
	}

	async importFile(id: string, path: string): Promise<TokenSet> {
		const adapter = this.get(id);
		if (adapter === undefined) throw new Error(`Unknown token format '${id}'`);
		if (adapter.importFile !== undefined) return adapter.importFile(path);
		if (adapter.importText === undefined) {
			throw new Error(`Token format '${id}' is export-only`);
		}
		const { readFile } = await import("node:fs/promises");
		return adapter.importText(await readFile(path, "utf8"));
	}

	exportText(id: string, set: TokenSet): string {
		const adapter = this.get(id);
		if (adapter === undefined) throw new Error(`Unknown token format '${id}'`);
		return adapter.exportText(set);
	}
}

export const createTokenFormatRegistry = (): TokenFormatRegistry =>
	new DefaultTokenFormatRegistry();
