import { createHashFn, dashCase } from "./hash.ts";
import { pairs, type FlatStyles } from "../lib/utils.ts";
import { isSafeCssValue, normalizeCssValue } from "./value-normalization.ts";
import { VARS_ATOMS } from "./vars-carrier.ts";
import { cssPropertyFromKey } from "../backends/css.ts";

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
export { VARS_ATOMS };

/** One structural class and the flattened style keys it activates. */
export interface VarAtom {
	readonly cls: string;
	readonly keys: string[];
}

/**
 * Host-ready output from `css.vars` or `cx.vars`.
 *
 * The public fields are safe to spread onto a host element. Symbol-keyed
 * metadata is private coordination between the compiler, `cx`, and runtime
 * stylesheet; consumers should not need to inspect it.
 *
 * @category styling
 * @since 0.1.0
 */
export interface VarsOutput {
	readonly class: string;
	readonly style: Record<string, string>;
	readonly [VARS_ATOMS]?: Array<VarAtom>;
}

const runtimeValue = normalizeCssValue;
/** Replaceable encoder for dynamic CSS values and their structural carriers. */
export interface VarCompiler {
	classFor(key: string): string;
	escapeClass(cls: string): string;
	encode(flat: FlatStyles): { atoms: Array<VarAtom>; style: Record<string, string> };
}

const selectorHash = createHashFn(false);

const isVarSelectorPart = (part: string): boolean =>
	part.startsWith("@") || /[&>+~:[\],.#*\s]/.test(part);

/** Stable, CSS-identifier-safe suffix for named and selector conditions. */
export const varConditionPart = (part: string): string => {
	if (part.startsWith("_")) return part.slice(1);
	return /^[A-Za-z_][\w-]*$/.test(part) ? part : `selector-${selectorHash("selector", part)}`;
};

class DefaultVarCompiler implements VarCompiler {
	private readonly conditions: ReadonlySet<string>;
	private readonly emptyConditions: ReadonlySet<string>;
	private readonly prefix: string;
	private readonly propertyAliases: Readonly<Record<string, string>> | undefined;

	constructor(
		conditionNames: Iterable<string> = [],
		emptyConditionNames: Iterable<string> = [],
		namespace?: string,
		propertyAliases?: Readonly<Record<string, string>>,
	) {
		this.conditions = new Set(conditionNames);
		this.emptyConditions = new Set(emptyConditionNames);
		this.prefix = `${namespace ?? "pw"}-`;
		this.propertyAliases = propertyAliases;
	}

	private splitKey(key: string): { conditions: string[]; prop: string; canonical: string } {
		const parts = key.split("__").filter((part) => part !== "");
		const first = parts[0]!;
		const last = parts[parts.length - 1]!;
		const propertyFirst =
			parts.length > 1 &&
			(this.conditions.has(last) || (!isVarSelectorPart(first) && isVarSelectorPart(last)));
		const rawProp = propertyFirst ? first : last;
		const rawConditions = propertyFirst ? parts.slice(1) : parts.slice(0, -1);
		return {
			prop: dashCase(cssPropertyFromKey(rawProp, {}, this.propertyAliases)),
			canonical: pairs.join(
				rawConditions
					.filter((condition) => !this.emptyConditions.has(condition))
					.toSorted()
					.concat(rawProp),
			),
			conditions: rawConditions
				.filter((condition) => !this.emptyConditions.has(condition))
				.map(varConditionPart)
				.toSorted(),
		};
	}

	classFor(key: string): string {
		if (!key.includes("__")) return `${this.prefix}${dashCase(key)}`;
		const { conditions, prop } = this.splitKey(key);
		return `${this.prefix}${conditions.length > 0 ? `${conditions.join(":")}:` : ""}${prop}`;
	}

	private baseCustomProp(prop: string): string {
		return `--${this.prefix}c-${prop}`;
	}

	private customPropFor(prop: string, conditions: string[]): string {
		// A condition-specific variable falls back to the base variable through
		// the toggle rule emitted by createStylesheet. Missing inline variants
		// therefore inherit instead of producing an invalid declaration.
		return conditions.length === 0
			? this.baseCustomProp(prop)
			: `--${this.prefix}c-${prop}_${conditions.join("_")}`;
	}

	escapeClass(cls: string): string {
		return cls.replace(/:/g, "\\:");
	}

	encode(flat: FlatStyles): { atoms: Array<VarAtom>; style: Record<string, string> } {
		const keys = Object.keys(flat);
		const singleKey = keys[0];
		if (keys.length === 1 && singleKey !== undefined && !singleKey.includes("__")) {
			const raw = flat[singleKey];
			if (!isSafeCssValue(raw) || raw === "") return { atoms: [], style: {} };
			const prop = dashCase(cssPropertyFromKey(singleKey, {}, this.propertyAliases));
			return {
				atoms: [{ cls: `${this.prefix}${prop}`, keys: [singleKey] }],
				style: { [this.baseCustomProp(prop)]: runtimeValue(prop, raw) },
			};
		}
		const atoms: Array<VarAtom> = [];
		const style: Record<string, string> = {};
		for (const key of keys.toSorted()) {
			const raw = flat[key];
			if (!isSafeCssValue(raw) || raw === "") continue;
			const { canonical, conditions, prop } = this.splitKey(key);
			if (!prop) continue;
			atoms.push({ cls: this.classFor(key), keys: [canonical] });
			style[this.customPropFor(prop, conditions)] = runtimeValue(prop, raw);
		}
		return { atoms, style };
	}
}

/**
 * Create the default variable carrier compiler.
 *
 * @param conditionNames - Condition names that should be treated as semantic
 *   paths when deriving custom-property fallbacks.
 * @param emptyConditionNames - Conditions that use the base carrier.
 * @param namespace - Prefix for carrier classes and custom properties.
 *   Defaults to `pw`.
 * @param propertyAliases - Optional authored property aliases.
 * @returns A compiler used by `css.vars` and runtime stylesheet generation.
 * @category styling
 * @since 0.1.0
 */
export const createVarCompiler = (
	conditionNames?: Iterable<string>,
	emptyConditionNames?: Iterable<string>,
	namespace?: string,
	propertyAliases?: Readonly<Record<string, string>>,
): VarCompiler =>
	new DefaultVarCompiler(conditionNames, emptyConditionNames, namespace, propertyAliases);
