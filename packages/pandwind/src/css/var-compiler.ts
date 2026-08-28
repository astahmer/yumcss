import { dashCase } from "./hash.ts";
import type { FlatStyles } from "../lib/utils.ts";

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
export const VARS_ATOMS = Symbol("pandwind.vars.atoms");

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
	encode(flat: FlatStyles): { atoms: Array<VarAtom>; style: Record<string, string> };
}

class DefaultVarCompiler implements VarCompiler {
	private splitKey(key: string): { conditions: string[]; prop: string } {
		const parts = key.split("__").filter((part) => part !== "");
		const rawProp = parts[parts.length - 1]!;
		return {
			prop: dashCase(rawProp),
			conditions: parts
				.slice(0, -1)
				.map((part) => (part.startsWith("_") ? part.slice(1) : part))
				.toSorted(),
		};
	}

	classFor(key: string): string {
		const { conditions, prop } = this.splitKey(key);
		return `pw-${conditions.length > 0 ? `${conditions.join(":")}:` : ""}${prop}`;
	}

	private baseCustomProp(prop: string): string {
		return `--pw-c-${prop}`;
	}

	private customPropFor(prop: string, conditions: string[]): string {
		// A condition-specific variable falls back to the base variable through
		// the toggle rule emitted by createStylesheet. Missing inline variants
		// therefore inherit instead of producing an invalid declaration.
		return conditions.length === 0
			? this.baseCustomProp(prop)
			: `--pw-c-${prop}_${conditions.join("_")}`;
	}

	escapeClass(cls: string): string {
		return cls.replace(/:/g, "\\:");
	}

	encode(flat: FlatStyles): { atoms: Array<VarAtom>; style: Record<string, string> } {
		const atoms: Array<VarAtom> = [];
		const style: Record<string, string> = {};
		for (const key of Object.keys(flat).toSorted()) {
			const raw = flat[key];
			if ((typeof raw !== "string" && !Number.isFinite(raw)) || raw === "") continue;
			const { conditions, prop } = this.splitKey(key);
			if (!prop) continue;
			atoms.push({ cls: this.classFor(key), keys: [key] });
			style[this.customPropFor(prop, conditions)] = `${raw}`;
		}
		return { atoms, style };
	}
}

export const createVarCompiler = (): VarCompiler => new DefaultVarCompiler();
