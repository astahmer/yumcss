// Generated from the workspace-linked pandwind package. Do not edit.
import { type FlatStyles } from "../lib/utils.d.ts";
import type { AnyCssConfig, AnyTokens, CssConfigReturn, DefinePresetOptions, StyleObject, TypedStyleObject } from "../types/typings.d.ts";
import { createCssBackend, type CssBackendOptions } from "../backends/css.d.ts";
import { ATOM_REGISTRY, type AtomRegistry } from "./atoms.d.ts";
/** Backend options shared by the public factory and its runtime attachments. */
export interface CreateCssOptions extends CssBackendOptions {
}
type TypedPreset = CssConfigReturn<DefinePresetOptions<AnyCssConfig, AnyTokens>>;
/** Atomic declaration names mapped to emitted class names. */
export type CompiledStyles = Record<string, string>;
/** Inline style/custom-property values carried by dynamic projections. */
export type CssStyle = Record<string, string>;
/** Unconstrained input record used by runtime group functions. */
export type AnyInput = Record<string, unknown>;
/** Internal marker that distinguishes a dynamic group result from compiled styles. */
export declare const DYNAMIC: unique symbol;
/** Serializable result of evaluating a dynamic group input. */
export interface DynamicReturn {
    readonly [DYNAMIC]: true;
    readonly style: CssStyle;
    readonly compiled: CompiledStyles;
}
/** Style declarations containing the named input contract used by `css.group`. */
export type DynamicStyles<TStyles extends StyleObject = StyleObject, TInput extends AnyInput = AnyInput> = TStyles & {
    $input: TInput;
};
/** Runtime evaluator produced for a dynamic group entry. */
export type DynamicFn<TInput extends AnyInput> = (input: TInput) => DynamicReturn;
/**
 * Minimal callable runtime shared by all optional method attachments.
 *
 * Attachments deliberately extend this value instead of making the core know
 * every projection. That keeps the runtime tree-shakeable and lets compiler
 * integrations install only the methods a module actually uses.
 */
export interface RuntimeCssFunction {
    (...styles: Array<StyleObject>): CompiledStyles;
    [ATOM_REGISTRY]?: AtomRegistry;
    [key: string]: unknown;
}
/** Services and backend state provided to an attachment during construction. */
export interface RuntimeCssContext {
    readonly backendOptions: CreateCssOptions;
    readonly backend: ReturnType<typeof createCssBackend>;
    readonly atoms: AtomRegistry;
    readonly compileStyles: (...styles: Array<StyleObject>) => CompiledStyles;
    readonly flatten: (style: StyleObject) => FlatStyles;
    readonly assign: (...styles: Array<StyleObject>) => StyleObject;
}
/** One independently replaceable method installation for the CSS runtime. */
export type RuntimeCssAttachment = (css: RuntimeCssFunction, context: RuntimeCssContext) => void;
/**
 * Build the callable declaration compiler and install the requested method
 * attachments. The default empty attachment list is intentional: low-level
 * integrations can compose a minimal runtime, while `createCss` supplies the
 * complete public surface.
 */
export declare function createCssRuntime(presetOrOptions?: CreateCssOptions | TypedPreset, options?: CreateCssOptions, attachments?: readonly RuntimeCssAttachment[]): RuntimeCssFunction;
/** Add preset-derived style typing to a runtime callable without changing its implementation. */
export type TypedRuntimeCssFunction<TPreset extends TypedPreset> = RuntimeCssFunction & ((...styles: Array<TypedStyleObject<TPreset["_config"], TPreset["tokens"], TPreset>>) => CompiledStyles);
export {};
