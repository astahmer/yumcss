import type { StyleObject } from "../types/typings.ts";
import { isEncodedFirstThatWorks } from "./first-that-works.ts";
import { createVarCompiler, type VarAtom, type VarsOutput } from "./var-compiler.ts";
import { flattenStyles } from "./style-flattening.ts";
import { VARS_ATOMS } from "./vars-carrier.ts";
import type { RuntimeCssAttachment } from "./runtime-base.ts";

/** Attach the dynamic-value projection that emits classes plus custom properties. */
export const attachVars: RuntimeCssAttachment = (css, context) => {
	const conditions = context.backendOptions.conditions;
	const conditionNames = conditions && Object.keys(conditions);
	const compiler = createVarCompiler(
		conditionNames,
		conditionNames?.filter((name) => !conditions?.[name]),
		context.backendOptions.namespace,
		context.resolveRuntimeValue,
	);
	css.vars = (...styles: Array<StyleObject>): VarsOutput => {
		const flat = flattenStyles(...styles);
		if (Object.values(flat).some(isEncodedFirstThatWorks)) {
			throw new Error(
				"pandwind: firstThatWorks is a static declaration fallback; use css() or css.class() instead of css.vars().",
			);
		}
		for (const key of Object.keys(flat)) context.validate(key, flat[key]);
		const { atoms, style } = compiler.encode(flat);
		const output: VarsOutput = {
			class: atoms.map((atom) => atom.cls).join(" "),
			style,
		};
		if (atoms.length > 0) (output as { [VARS_ATOMS]?: Array<VarAtom> })[VARS_ATOMS] = atoms;
		return output;
	};
};
