/**
 * Var-inline encoding (plans/014 §1) — dynamic VALUES as inline custom
 * properties.
 *
 * A `css.vars({ color: value, _hover: { color: value2 } })` call flattens to
 * keys (`color`, `_hover__color`) that each map to:
 *
 * - a deterministic class:  `pw-color`, `pw-hover:color`
 *   (conditions joined by `:`, leading `_` stripped — no preset needed at
 *   runtime, so class names are identical at runtime and build time);
 * - an inline custom property per key:  `--pw-c-color`,
 *   `--pw-c-color_hover` (base + one override per condition path);
 * - toggle rules in the generated sheet (see create-stylesheet
 *   `processVarKey`/`gen.varRules`): the rule for a condition path resolves
 *   the property through a fallback CHAIN across every prefix of the path,
 *   most specific first, ending at the base var. Missing links simply fall
 *   through, so the sheet can emit full chains without knowing which values
 *   a given element sets inline.
 *
 * The VALUE never appears in any generated CSS — it rides the element's
 * inline style. That is what makes this escape hatch free of runtime CSS
 * injection.
 */
import { dashCase } from "./hash.ts";
import type { FlatStyles } from "../lib/utils.ts";

/** Symbol carried by `css.vars()` outputs so the merge engine can recognize them. */
export const VARS_ATOMS = Symbol("pandwind.vars.atoms");

export interface VarAtom {
	/** The class name, e.g. `pw-color` or `pw-dark:hover:color`. */
	cls: string;
	/** Flattened style keys backing the class (`_hover__color`, …). */
	keys: string[];
}

export interface VarsOutput {
	class: string;
	style: Record<string, string>;
	[VARS_ATOMS]?: Array<VarAtom>;
}

const splitKey = (key: string): { conditions: string[]; prop: string } => {
	// Canonical form: conditions sorted alphabetically, leading underscores
	// stripped, property dashCased — identical at runtime and build time no
	// matter how the input nests or orders conditions.
	const parts = key.split("__").filter((part) => part !== "");
	const rawProp = parts[parts.length - 1]!;
	const prop = dashCase(rawProp);
	const conditions = parts
		.slice(0, -1)
		.map((part) => (part.startsWith("_") ? part.slice(1) : part))
		.toSorted();
	return { conditions, prop };
};

/** `color` | `_hover__color` -> `pw-color` | `pw-hover:color` */
export const varClassFor = (key: string): string => {
	const { conditions, prop } = splitKey(key);
	const head = conditions.length > 0 ? `${conditions.join(":")}:` : "";
	return `pw-${head}${prop}`;
};

/** Base custom property: `--pw-c-color`. */
export const baseCustomProp = (prop: string): string => `--pw-c-${prop}`;

/** Condition-path custom property: `--pw-c-color_hover`, `--pw-c-color_dark_hover`. */
export const customPropFor = (prop: string, conditions: string[]): string =>
	conditions.length === 0 ? baseCustomProp(prop) : `--pw-c-${prop}_${conditions.join("_")}`;

/**
 * Fallback chain across all prefixes of the condition path, most specific
 * first, base last: `[_dark,_hover]` ->
 * `var(--x_dark_hover, var(--x_dark, var(--x)))`.
 */
export const fallbackChain = (prop: string, conditions: string[]): string => {
	let chain = `var(${baseCustomProp(prop)})`;
	for (let i = 1; i <= conditions.length; i++) {
		chain = `var(${customPropFor(prop, conditions.slice(0, i))}, ${chain})`;
	}
	return chain;
};

/** Escape a class for use in a selector (`:` -> `\:`). */
export const escapeVarClass = (cls: string): string => cls.replace(/:/g, "\\:");

/**
 * Encode a `css.vars()` input into atoms + inline style.
 *
 * Only string values become custom properties (booleans are structural
 * markers from nesting, numbers are stringified). Deterministic: identical
 * inputs yield byte-identical output.
 */
export const encodeVars = (
	flat: FlatStyles,
): { atoms: Array<VarAtom>; style: Record<string, string> } => {
	const atoms: Array<VarAtom> = [];
	const style: Record<string, string> = {};
	for (const key of Object.keys(flat).toSorted()) {
		const raw = flat[key];
		if (typeof raw !== "string") continue;
		const { conditions, prop } = splitKey(key);
		if (prop === "") continue;
		const cls = varClassFor(key);
		atoms.push({ cls, keys: [key] });
		style[customPropFor(prop, conditions)] = raw;
	}
	return { atoms, style };
};
