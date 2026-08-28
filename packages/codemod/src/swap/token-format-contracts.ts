export const TOKEN_FORMAT_SCHEMA = "pandwind.token-format/1" as const;

/** Versioned normalized token IR shared by every source and target format. */
export enum TokenFormatId {
	Dtcg = "dtcg",
	Theme = "theme",
	Panda = "panda",
	Preset = "preset",
	StyleDictionary = "sd",
	Figma = "figma",
	RootCss = "rootcss",
	StyleX = "stylex",
}

export interface TokenSet {
	/** group -> flat token key -> resolved value; adapters own nesting rules. */
	readonly groups: Record<string, Record<string, string>>;
}

/**
 * One format implementation. Adding a format means implementing this port
 * and registering it; the codec never needs a format-specific branch.
 */
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
