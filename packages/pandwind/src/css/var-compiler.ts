import { createHashFn, dashCase } from "./hash.ts";
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

const UNITLESS_PROPERTIES = new Set([
	"animation-iteration-count",
	"aspect-ratio",
	"border-image-outset",
	"border-image-slice",
	"border-image-width",
	"box-flex",
	"box-flex-group",
	"box-ordinal-group",
	"column-count",
	"columns",
	"flex",
	"flex-grow",
	"flex-shrink",
	"font-weight",
	"grid-area",
	"grid-column",
	"grid-column-end",
	"grid-column-start",
	"grid-row",
	"grid-row-end",
	"grid-row-start",
	"line-clamp",
	"line-height",
	"opacity",
	"order",
	"orphans",
	"tab-size",
	"widows",
	"z-index",
	"zoom",
	"fill-opacity",
	"flood-opacity",
	"stop-opacity",
	"stroke-dasharray",
	"stroke-dashoffset",
	"stroke-miterlimit",
	"stroke-opacity",
	"stroke-width",
	"scale",
]);

const runtimeValue = (property: string, value: string | number): string =>
	typeof value === "number" && !property.startsWith("--") && !UNITLESS_PROPERTIES.has(property)
		? `${value}px`
		: `${value}`;

export interface VarCompiler {
	classFor(key: string): string;
	escapeClass(cls: string): string;
	encode(flat: FlatStyles): { atoms: Array<VarAtom>; style: Record<string, string> };
}

const selectorHash = createHashFn(false);

export const isVarSelectorPart = (part: string): boolean =>
	part.startsWith("@") || /[&>+~:[\],.#*\s]/.test(part);

/** Stable, CSS-identifier-safe suffix for named and selector conditions. */
export const varConditionPart = (part: string): string => {
	if (part.startsWith("_")) return part.slice(1);
	return /^[A-Za-z_][\w-]*$/.test(part) ? part : `selector-${selectorHash("selector", part)}`;
};

class DefaultVarCompiler implements VarCompiler {
	private readonly conditions: ReadonlySet<string>;

	constructor(conditionNames: Iterable<string> = []) {
		this.conditions = new Set(conditionNames);
	}

	private splitKey(key: string): { conditions: string[]; prop: string } {
		const parts = key.split("__").filter((part) => part !== "");
		const first = parts[0]!;
		const last = parts[parts.length - 1]!;
		const propertyFirst =
			parts.length > 1 &&
			(this.conditions.has(last) || (!isVarSelectorPart(first) && isVarSelectorPart(last)));
		const rawProp = propertyFirst ? first : last;
		const rawConditions = propertyFirst ? parts.slice(1) : parts.slice(0, -1);
		return {
			prop: dashCase(rawProp),
			conditions: rawConditions.map(varConditionPart).toSorted(),
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
			if (raw === undefined || (typeof raw !== "string" && !Number.isFinite(raw)) || raw === "")
				continue;
			const { conditions, prop } = this.splitKey(key);
			if (!prop) continue;
			atoms.push({ cls: this.classFor(key), keys: [key] });
			style[this.customPropFor(prop, conditions)] = runtimeValue(prop, raw);
		}
		return { atoms, style };
	}
}

export const createVarCompiler = (conditionNames?: Iterable<string>): VarCompiler =>
	new DefaultVarCompiler(conditionNames);
