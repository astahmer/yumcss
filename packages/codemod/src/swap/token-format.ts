import type { TokenSet } from "./token-set.ts";

export type TokenFormatId =
	| "dtcg"
	| "theme"
	| "panda"
	| "preset"
	| "sd"
	| "figma"
	| "rootcss"
	| "stylex";

export interface TokenFormatAdapter {
	readonly id: TokenFormatId;
	readonly importText?: (text: string) => TokenSet | Promise<TokenSet>;
	readonly importFile?: (path: string) => Promise<TokenSet>;
	readonly exportText: (set: TokenSet) => string;
}
