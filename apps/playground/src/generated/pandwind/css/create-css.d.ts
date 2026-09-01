// Generated from the workspace-linked pandwind package. Do not edit.
import type { AnyCssConfig, AnyTokens, CssConfigReturn, DefinePresetOptions, StyleObject, TypedStyleObject } from "../types/typings.d.ts";
import { type CssBackendOptions } from "../backends/css.d.ts";
import type { ClassNameStrategy } from "./class-name-strategy.d.ts";
import { type VarsOutput } from "./vars.d.ts";
export type { ClassNameStrategy };
type TypedPreset = CssConfigReturn<DefinePresetOptions<AnyCssConfig, AnyTokens>>;
type CompiledStyles = Record<string, string>;
type CssStyle = Record<string, string>;
declare const DYNAMIC: unique symbol;
/**
 * Untyped convenience — useful for throwaway styles or before the preset
 * types are wired up. Values are loose strings / nested objects.
 */
export declare function createCss<TPreset extends TypedPreset>(preset: TPreset, options?: CreateCssOptions): CssFn<TypedStyleObject<TPreset["_config"], TPreset["tokens"], TPreset>>;
export declare function createCss(options?: CreateCssOptions): CssFn<StyleObject>;
/** Fully typed against a preset: every value is a token or a constrained option. */
export declare function createCss<TPreset extends CssConfigReturn<DefinePresetOptions<AnyCssConfig, AnyTokens>>>(options?: CreateCssOptions): CssFn<TypedStyleObject<TPreset["_config"], TPreset["tokens"], TPreset>>;
/** Backend options (plans/021): forwarded to the css backend unchanged. */
export interface CreateCssOptions extends CssBackendOptions {
}
interface DynamicReturn {
    [DYNAMIC]: true;
    style: CssStyle;
    compiled: CompiledStyles;
}
interface PropsReturn {
    style: CssStyle | undefined;
    className: string | undefined;
    [key: string]: unknown;
}
type PropsInput = CompiledStyles | DynamicReturn | VarsOutput | string | readonly PropsInput[] | false | null | undefined;
type AnyInput = Record<string, unknown>;
type DynamicFn<TInput extends AnyInput> = (input: TInput) => DynamicReturn;
type DynamicStyles<TStyles extends StyleObject = StyleObject, TInput extends AnyInput = AnyInput> = TStyles & {
    $input: TInput;
};
export interface CssFn<TStyles extends StyleObject = StyleObject> {
    (...styles: Array<TStyles>): CompiledStyles;
    class: (...styles: Array<TStyles>) => string;
    /**
     * Dynamic values as inline custom properties (plans/014): returns a
     * `{ class, style }` pair. Keys share the css() typings; values are
     * delivered inline, so nothing enters the generated stylesheet.
     */
    vars: (...styles: Array<TStyles>) => VarsOutput;
    raw: (...styles: Array<TStyles>) => StyleObject;
    props: (...styles: Array<PropsInput>) => PropsReturn;
    group: <TGroup extends Record<string, TStyles | DynamicStyles<TStyles> | string | ((...args: any[]) => TStyles)>>(styles: TGroup) => {
        [Key in keyof TGroup]: TGroup[Key] extends {
            $input: infer TInput;
        } ? TInput extends AnyInput ? DynamicFn<TInput> : never : TGroup[Key] extends (...args: infer TArgs) => TStyles ? (...args: TArgs) => VarsOutput : TGroup[Key] extends string ? string : CompiledStyles;
    };
    input: (name: string) => never;
}
