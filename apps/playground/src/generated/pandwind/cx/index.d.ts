// Generated from the workspace-linked pandwind package. Do not edit.
import type { CssFn } from "../css/create-css.d.ts";
import { type VarAtom, type VarsOutput } from "../css/var-compiler.d.ts";
import type { TwComposeMeta, TwConflictsMeta, TwVariantsMeta } from "../tw/compile.d.ts";
export interface CxOptions {
    variants?: TwVariantsMeta;
    conflicts?: TwConflictsMeta;
    compose?: TwComposeMeta;
    /**
     * A createCss / createDesignCss instance. Its atom registry lets cx
     * resolve css.class() strings to the properties they set, so they merge
     * against tw classes and raw strings.
     */
    css?: CssFn<never>;
}
/**
 * A css() compiled map (`{ color: "1nmpgqu" }`), a class string, or a
 * `css.vars()` output (recognized via the VARS_ATOMS symbol carrier).
 */
export type CxInput = string | Record<string, string> | VarsOutput | false | null | undefined;
/** Re-exported for consumers threading vars outputs through custom helpers. */
export type { VarsOutput, VarAtom };
/**
 * Create the app's `cx` merge function, bound to the same generated tw
 * metadata and css engine the rest of the app uses.
 */
export interface CxFn {
    (...inputs: Array<CxInput | CxInput[]>): string;
    /** Merge for `css.vars()` outputs: classes + inline custom properties. */
    vars: (...inputs: Array<CxInput | CxInput[]>) => VarsOutput;
}
export declare function createCx(options?: CxOptions): CxFn;
