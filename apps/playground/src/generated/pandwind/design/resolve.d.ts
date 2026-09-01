// Generated from the workspace-linked pandwind package. Do not edit.
import type { AnyTokens, StyleObject } from "../types/typings.d.ts";
import { type DesignModuleAdapter, type DesignModuleKey, type DesignModuleRegistry } from "./contracts.d.ts";
type ModuleKey = DesignModuleKey;
export type { DesignModuleAdapter, DesignModuleContext, DesignModuleRegistry, TokenLookup, } from "./contracts.d.ts";
export declare class DefaultDesignModuleRegistry implements DesignModuleRegistry {
    private readonly adapters;
    constructor(adapters?: readonly DesignModuleAdapter[]);
    register(adapter: DesignModuleAdapter): void;
    resolve(key: ModuleKey, props: Record<string, unknown>, tokens: AnyTokens | undefined): StyleObject;
}
export declare const createDesignModuleRegistry: (adapters?: readonly DesignModuleAdapter[]) => DesignModuleRegistry;
export declare class DesignStyleResolver {
    readonly registry: DesignModuleRegistry;
    constructor(registry?: DesignModuleRegistry);
    resolve(style: Record<string, unknown>, tokens: AnyTokens | undefined): StyleObject;
}
export declare const resolveDesignStyle: (style: Record<string, unknown>, tokens: AnyTokens | undefined) => StyleObject;
