import type { StyleObject } from "../types/typings.ts";
import { createVarCompiler, VARS_ATOMS, type VarAtom, type VarsOutput } from "./var-compiler.ts";
import type { RuntimeCssAttachment } from "./runtime-base.ts";

/** Attach the dynamic-value projection that emits classes plus custom properties. */
export const attachVars: RuntimeCssAttachment = (css, context) => {
	css.vars = (...styles: Array<StyleObject>): VarsOutput => {
		const flat = context.flatten(context.assign(...styles));
		const { atoms, style } = createVarCompiler(
			context.backendOptions.conditions && Object.keys(context.backendOptions.conditions),
		).encode(flat);
		const output: VarsOutput = {
			class: atoms.map((atom) => atom.cls).join(" "),
			style,
		};
		if (atoms.length > 0) (output as { [VARS_ATOMS]?: Array<VarAtom> })[VARS_ATOMS] = atoms;
		return output;
	};
};
