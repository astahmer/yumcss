import type { AnyTokens, StyleObject } from "../types/typings.ts";

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
		return groupTokens?.[value] !== undefined ? String(groupTokens[value]) : value;
	};
