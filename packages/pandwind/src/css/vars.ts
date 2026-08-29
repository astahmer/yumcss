/** Compatibility façade for the scoped variable compiler. */
import type { FlatStyles } from "../lib/utils.ts";
import { createVarCompiler } from "./var-compiler.ts";

export { VARS_ATOMS, createVarCompiler } from "./var-compiler.ts";
export type { VarAtom, VarCompiler, VarsOutput } from "./var-compiler.ts";

export const encodeVars = (flat: FlatStyles, conditionNames?: Iterable<string>) =>
	createVarCompiler(conditionNames).encode(flat);
