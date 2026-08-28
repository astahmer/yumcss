const TOKEN_FORMAT_SCHEMA = "pandwind.token-format/1" as const;

export type TokenFormatId =
	| "dtcg"
	| "theme"
	| "panda"
	| "preset"
	| "sd"
	| "figma"
	| "rootcss"
	| "stylex";

export interface TokenSet {
	readonly groups: Record<string, Record<string, string>>;
}

export interface TokenFormatAdapter {
	readonly schema: typeof TOKEN_FORMAT_SCHEMA;
	readonly id: TokenFormatId;
	readonly canImport: boolean;
	readonly canExport: boolean;
	importText?(text: string): TokenSet;
	importFile?(path: string): Promise<TokenSet>;
	export(set: TokenSet): string;
}

export interface TokenFormatRegistry {
	readonly adapters: readonly TokenFormatAdapter[];
	register(adapter: TokenFormatAdapter): TokenFormatRegistry;
	get(id: string): TokenFormatAdapter | undefined;
}
