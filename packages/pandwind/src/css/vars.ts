/** Compatibility façade for the scoped variable compiler. */
import type { FlatStyles } from "../lib/utils.ts";
import { VarCompiler, createVarCompiler } from "./var-compiler.ts";

export { VARS_ATOMS, VarCompiler, createVarCompiler } from "./var-compiler.ts";
export type { VarAtom, VarsOutput } from "./var-compiler.ts";

const compiler = createVarCompiler();

export const encodeVars = (flat: FlatStyles) => compiler.encode(flat);
export const varClassFor = VarCompiler.classFor;
export const baseCustomProp = VarCompiler.baseCustomProp;
export const customPropFor = VarCompiler.customPropFor;
export const fallbackChain = VarCompiler.fallbackChain;
export const escapeVarClass = VarCompiler.escapeClass;
