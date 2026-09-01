// Generated from the workspace-linked pandwind package. Do not edit.
import type { CompositionStyles } from "./composition.d.ts";
import type { GlobalStyleIdentityFn, KeyframeIdentityFn, SystemStyleIdentityFn } from "./css.types.d.ts";
import type { RecipeIdentityFn, SlotRecipeIdentityFn } from "./recipe.types.d.ts";
import type { ConditionRecord, SemanticTokenDefinition, SystemConfig, TokenDefinition } from "./types.d.ts";
export declare const defineConditions: <T extends ConditionRecord>(v: T) => T;
export declare const defineRecipe: RecipeIdentityFn;
export declare const defineSlotRecipe: SlotRecipeIdentityFn;
export declare const defineKeyframes: KeyframeIdentityFn;
export declare const defineGlobalStyles: GlobalStyleIdentityFn;
export declare const defineStyle: SystemStyleIdentityFn;
export declare const defineTextStyles: (v: CompositionStyles["textStyles"]) => import("./composition.d.ts").TextStyles;
export declare const defineAnimationStyles: (v: CompositionStyles["animationStyles"]) => import("./composition.d.ts").AnimationStyles;
export declare const defineLayerStyles: (v: CompositionStyles["layerStyles"]) => import("./composition.d.ts").LayerStyles;
type ProxyValue<T> = {
    <Value>(definition: Value extends T ? Value : T): Value;
} & {
    [K in keyof Required<T>]: <Value>(definition: Value extends T[K] ? Value : T[K]) => Value;
};
export declare const defineTokens: ProxyValue<TokenDefinition>;
export declare const defineSemanticTokens: ProxyValue<SemanticTokenDefinition>;
export declare const defineConfig: (v: SystemConfig) => SystemConfig;
export { mergeConfigs } from "./merge-config.d.ts";
