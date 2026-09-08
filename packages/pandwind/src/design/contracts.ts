import type { AnyTokens, StyleObject } from "../types/typings.ts";
import { canonicalTokenName } from "../lib/token-path.ts";

export type DesignModuleKey = "$frame" | "$layout" | "$text";
export type TokenLookup = (group: string, value: string | number) => string;

export interface DesignModuleContext {
	readonly tokens: AnyTokens | undefined;
	readonly token: TokenLookup;
}

export interface DesignModuleAdapter {
	readonly key: DesignModuleKey;
	resolve(props: Record<string, unknown>, context: DesignModuleContext): StyleObject;
}

export interface DesignModuleRegistry {
	register(adapter: DesignModuleAdapter): void;
	resolve(
		key: DesignModuleKey,
		props: Record<string, unknown>,
		tokens: AnyTokens | undefined,
	): StyleObject;
}

export const isDesignModuleKey = (key: string): key is DesignModuleKey =>
	key === "$frame" || key === "$layout" || key === "$text";

export const createTokenLookup =
	(tokens: AnyTokens | undefined): TokenLookup =>
	(group, value) => {
		if (typeof value === "number") return String(value);
		const groupTokens = tokens?.[group];
		if (groupTokens?.[value] !== undefined) return String(groupTokens[value]);
		const canonical = canonicalTokenName(value);
		if (groupTokens?.[canonical] !== undefined) return String(groupTokens[canonical]);
		for (const [name, tokenValue] of Object.entries(groupTokens ?? {})) {
			if (canonicalTokenName(name) === canonical) return String(tokenValue);
		}
		return value;
	};
