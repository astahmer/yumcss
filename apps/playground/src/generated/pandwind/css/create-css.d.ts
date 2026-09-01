// Generated from the workspace-linked pandwind package. Do not edit.
import type { AnyCssConfig, AnyTokens, CssConfigReturn, DefinePresetOptions, StyleObject, TypedStyleObject } from "../types/typings.d.ts";
import { type CompiledStyles, type CreateCssOptions, type AnyInput, type DynamicFn, type DynamicReturn, type DynamicStyles } from "./runtime-base.d.ts";
import type { ClassNameStrategy } from "./class-name-strategy.d.ts";
import type { VarsOutput } from "./var-compiler.d.ts";
export type { ClassNameStrategy };
export type { CreateCssOptions } from "./runtime-base.d.ts";
type TypedPreset = CssConfigReturn<DefinePresetOptions<AnyCssConfig, AnyTokens>>;
/**
 * Create the typed CSS function used by the public `css()` lane.
 *
 * A preset supplies the token and condition vocabulary; the returned callable
 * compiles style objects to declaration maps and exposes the attached
 * projections documented by `CssFn`. Bundler integrations may replace this
 * full runtime with a statically lowered callable or a smaller attachment set
 * without changing the source-level type surface.
 */
export declare function createCss<TPreset extends TypedPreset>(preset: TPreset, options?: CreateCssOptions): CssFn<TypedStyleObject<TPreset["_config"], TPreset["tokens"], TPreset>>;
export declare function createCss(options?: CreateCssOptions): CssFn<StyleObject>;
export declare function createCss<TPreset extends CssConfigReturn<DefinePresetOptions<AnyCssConfig, AnyTokens>>>(options?: CreateCssOptions): CssFn<TypedStyleObject<TPreset["_config"], TPreset["tokens"], TPreset>>;
interface PropsReturn {
    style: Record<string, string> | undefined;
    className: string | undefined;
    [key: string]: unknown;
}
type PropsInput = CompiledStyles | DynamicReturn | VarsOutput | string | readonly PropsInput[] | false | null | undefined;
/**
 * The complete source-level contract for `createCss`.
 *
 * The callable form is the low-level declaration-map result. The named
 * methods are explicit projections for class strings, dynamic values, host
 * props, reusable groups, and raw style objects; keeping them on one typed
 * value lets compiler and runtime implementations share the same API.
 */
export interface CssFn<TStyles extends StyleObject = StyleObject> {
    /** Compile style objects to the atomic declaration map consumed by the CSS engine. */
    (...styles: Array<TStyles>): CompiledStyles;
    /** Compile style objects and return their atom classes as one class string. */
    class: (...styles: Array<TStyles>) => string;
    /** Encode style declarations as classes plus inline custom properties for dynamic values. */
    vars: (...styles: Array<TStyles>) => VarsOutput;
    /** Merge style objects without compiling them, for stylesheet and bridge consumers. */
    raw: (...styles: Array<TStyles>) => StyleObject;
    /** Normalize compiled styles, variable carriers, and class strings into host props. */
    props: (...styles: Array<PropsInput>) => PropsReturn;
    /** Build a reusable map of static, dynamic, string, or parameterized style groups. */
    group: <TGroup extends Record<string, TStyles | DynamicStyles<TStyles> | string | ((...args: any[]) => TStyles)>>(styles: TGroup) => {
        [Key in keyof TGroup]: TGroup[Key] extends {
            $input: infer TInput;
        } ? TInput extends AnyInput ? DynamicFn<TInput> : never : TGroup[Key] extends (...args: infer TArgs) => TStyles ? (...args: TArgs) => VarsOutput : TGroup[Key] extends string ? string : CompiledStyles;
    };
    /** Mark a named runtime input for a dynamic `group` definition. */
    input: (name: string) => never;
}
