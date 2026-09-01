// Generated from the workspace-linked pandwind package. Do not edit.
import type { FlatStyles } from "../lib/utils.d.ts";
/**
 * Var-inline compiler for dynamic values.
 *
 * The class is the stable structural identity for a flattened style key;
 * values themselves travel through element inline styles. Conditions are
 * encoded into the key so the stylesheet can select the right custom
 * property without knowing the value at build time. This is intentionally
 * not a CSS-injection path: no dynamic value is serialized into generated
 * CSS.
 */
export declare const VARS_ATOMS: unique symbol;
export interface VarAtom {
    readonly cls: string;
    readonly keys: string[];
}
export interface VarsOutput {
    readonly class: string;
    readonly style: Record<string, string>;
    readonly [VARS_ATOMS]?: Array<VarAtom>;
}
export interface VarCompiler {
    classFor(key: string): string;
    escapeClass(cls: string): string;
    encode(flat: FlatStyles): {
        atoms: Array<VarAtom>;
        style: Record<string, string>;
    };
}
export declare const createVarCompiler: (conditionNames?: Iterable<string>) => VarCompiler;
