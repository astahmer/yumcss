import { dashCase } from "./hash.ts";
import type { FlatStyles } from "../lib/utils.ts";

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

export class VarCompiler {
	static splitKey(key: string): { conditions: string[]; prop: string } {
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

	static classFor(key: string): string {
		const { conditions, prop } = VarCompiler.splitKey(key);
		return `pw-${conditions.length > 0 ? `${conditions.join(":")}:` : ""}${prop}`;
	}

	static baseCustomProp(prop: string): string {
		return `--pw-c-${prop}`;
	}

	static customPropFor(prop: string, conditions: string[]): string {
		return conditions.length === 0
			? VarCompiler.baseCustomProp(prop)
			: `--pw-c-${prop}_${conditions.join("_")}`;
	}

	static fallbackChain(prop: string, conditions: string[]): string {
		let chain = `var(${VarCompiler.baseCustomProp(prop)})`;
		for (let i = 1; i <= conditions.length; i++) {
			chain = `var(${VarCompiler.customPropFor(prop, conditions.slice(0, i))}, ${chain})`;
		}
		return chain;
	}

	static escapeClass(cls: string): string {
		return cls.replace(/:/g, "\\:");
	}

	encode(flat: FlatStyles): { atoms: Array<VarAtom>; style: Record<string, string> } {
		const atoms: Array<VarAtom> = [];
		const style: Record<string, string> = {};
		for (const key of Object.keys(flat).toSorted()) {
			const raw = flat[key];
			if ((typeof raw !== "string" && !Number.isFinite(raw)) || raw === "") continue;
			const { conditions, prop } = VarCompiler.splitKey(key);
			if (!prop) continue;
			atoms.push({ cls: VarCompiler.classFor(key), keys: [key] });
			style[VarCompiler.customPropFor(prop, conditions)] = `${raw}`;
		}
		return { atoms, style };
	}
}

export const createVarCompiler = (): VarCompiler => new VarCompiler();
