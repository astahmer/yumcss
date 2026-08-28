/** Compatibility façade for the scoped variable compiler. */
import type { FlatStyles } from "../lib/utils.ts";
import { createVarCompiler } from "./var-compiler.ts";

export { VARS_ATOMS, createVarCompiler } from "./var-compiler.ts";
export type { VarAtom, VarCompiler, VarsOutput } from "./var-compiler.ts";

const compiler = createVarCompiler();

export const encodeVars = (flat: FlatStyles) => compiler.encode(flat);
