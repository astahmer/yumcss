// Generated from the workspace-linked pandwind package. Do not edit.
/** Compatibility façade for the scoped variable compiler. */
import type { FlatStyles } from "../lib/utils.d.ts";
export { VARS_ATOMS, createVarCompiler } from "./var-compiler.d.ts";
export type { VarAtom, VarCompiler, VarsOutput } from "./var-compiler.d.ts";
export declare const encodeVars: (flat: FlatStyles, conditionNames?: Iterable<string>) => {
    atoms: Array<import("./var-compiler.d.ts").VarAtom>;
    style: Record<string, string>;
};
