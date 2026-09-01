// Generated from the workspace-linked pandwind package. Do not edit.
import type { AnyTokens, StyleObject } from "../types/typings.d.ts";
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
    resolve(key: DesignModuleKey, props: Record<string, unknown>, tokens: AnyTokens | undefined): StyleObject;
}
export declare const isDesignModuleKey: (key: string) => key is DesignModuleKey;
export declare const createTokenLookup: (tokens: AnyTokens | undefined) => TokenLookup;
