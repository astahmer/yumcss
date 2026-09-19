import type { AtomRegistry } from "../css/atoms.ts";
import type { ClassNameStrategy } from "../css/class-name-strategy.ts";
import type { CssCascade } from "../css/cascade.ts";
import { createHashFn } from "../css/hash.ts";
import type { StyleBackend } from "./types.ts";
import { isEncodedFirstThatWorks, normalizeFirstThatWorks } from "../css/first-that-works.ts";

type CssBackend = Omit<StyleBackend, "declare"> & {
	/** Atom registry shared with the stylesheet generator and cx. */
	readonly atoms: AtomRegistry;
	/** CSS accepts numeric JS values before property-aware normalization. */
	declare(key: string, value: string | number): string;
};

export interface CssBackendOptions {
	debug?: boolean;
	hashFn?: (key: string, value: string | true) => string;
	className?: ClassNameStrategy;
	/**
	 * Opt into a host-override cascade strategy. `specificity` follows
	 * StyleX's `:not(#\#)` priority levels; `layers` wraps output in the
	 * the native `@layer pandwind` layer. Pass `{ mode: "layers", layer }`
	 * to select a different layer name.
	 */
	cascade?: CssCascade;
	/**
	 * Namespace for Pandwind-owned dynamic-value carriers and custom properties.
	 * Defaults to `pw`; caller-owned class-name strategies are not rewritten.
	 */
	namespace?: string;
	/** Preset conditions used to canonicalize responsive var paths. */
	conditions?: Record<string, string | string[]>;
}

const isConditionPathPart = (
	part: string,
	conditions: Record<string, string | string[]>,
): boolean =>
	part.startsWith("_") || Object.hasOwn(conditions, part) || /[&>+~:[\],.#*\s]/.test(part);

const colorProperties = new Set([
	"color",
	"background",
	"backgroundColor",
	"borderColor",
	"borderTopColor",
	"borderRightColor",
	"borderBottomColor",
	"borderLeftColor",
	"outlineColor",
	"textDecorationColor",
	"textEmphasisColor",
	"fill",
	"stroke",
]);

export const isColorProperty = (property: string): boolean => colorProperties.has(property);

export const isEmptyCondition = (
	part: string,
	conditions: Record<string, string | string[]>,
): boolean => {
	const value = conditions[part];
	return value === "" || (Array.isArray(value) && value.every((item) => item === ""));
};

/** Find the CSS property in a canonical condition/property path. */
export const cssPropertyFromKey = (
	key: string,
	conditions: Record<string, string | string[]> = {},
): string => {
	const parts = key.includes("__") ? key.split("__") : [key];
	for (let index = parts.length - 1; index >= 0; index--) {
		const part = parts[index]!;
		if (!isConditionPathPart(part, conditions)) return part;
	}
	const fallback = parts.at(-1) ?? "";
	return fallback;
};

const rawCssPropertyFromKey = (
	key: string,
	conditions: Record<string, string | string[]> = {},
): string => {
	const parts = key.includes("__") ? key.split("__") : [key];
	for (let index = parts.length - 1; index >= 0; index--) {
		const part = parts[index]!;
		if (!isConditionPathPart(part, conditions)) return part;
	}
	return parts.at(-1) ?? "";
};

/** Canonicalize a flattened path with condition segments before its property. */
export const canonicalStyleKey = (
	key: string,
	conditions: Record<string, string | string[]> = {},
): string => {
	if (!key.includes("__")) return key;
	const parts = key.split("__").filter((part) => part !== "");
	if (parts.length < 2) return parts[0] ?? "";
	const property = rawCssPropertyFromKey(key, conditions);
	const propertyIndex = parts.lastIndexOf(property);
	if (propertyIndex < 0) return parts.toSorted().join("__");
	const conditionParts = parts
		.filter((_part, index) => index !== propertyIndex)
		.filter((part) => !isEmptyCondition(part, conditions))
		.sort();
	conditionParts.push(property);
	return conditionParts.join("__");
};

/**
 * The web backend (plans/021 reference implementation): lowers flattened
 * declarations to class names and registers them in the atom registry that
 * the generated stylesheet and `cx` both read.
 *
 * Behavior moved verbatim from create-css.ts `register` — the strategy
 * chain (custom class or null) followed by the hashed atomic fallback —
 * so outputs stay byte-identical with pre-extraction builds.
 */
export function createCssBackend(options: CssBackendOptions = {}): CssBackend {
	const hashFn = options.hashFn ?? createHashFn(options.debug ?? false);
	const strategy: ClassNameStrategy | undefined = options.className;
	const sheetBacked = strategy?.sheetBacked === true;
	const atoms: AtomRegistry = new Map();
	const declarations = new Map<string, Map<string, string>>();

	const declare = (key: string, value: string | number): string => {
		const orderedKey = canonicalStyleKey(key, options.conditions);
		const property = cssPropertyFromKey(orderedKey, options.conditions);
		if (isEncodedFirstThatWorks(value) && strategy !== undefined && !sheetBacked) {
			throw new Error(
				"pandwind: firstThatWorks requires the atomic stylesheet or a sheet-backed class-name strategy.",
			);
		}
		const rawValue = normalizeFirstThatWorks(property, value);
		let values = declarations.get(orderedKey);
		if (values === undefined) {
			values = new Map();
			declarations.set(orderedKey, values);
		}
		const cached = values.get(rawValue);
		if (cached !== undefined) return cached;
		// The stylesheet canonicalizes flattened condition paths before it
		// hashes them. Do the same at declaration time so inverted nesting
		// (`{ color: { _hover: value } }`) cannot produce an atom with no rule.
		if (strategy !== undefined) {
			const custom = strategy.toClassName(orderedKey, rawValue);
			if (typeof custom === "string" && custom.length > 0 && !/[\s\u0000]/.test(custom)) {
				// Sheet-backed strategies compile through this engine's own
				// stylesheet, so their classes join the atom registry — that is
				// what keeps cx() merging and the generated rules working.
				if (sheetBacked && !atoms.has(custom)) atoms.set(custom, orderedKey);
				values.set(rawValue, custom);
				return custom;
			}
		}
		const atom = hashFn(orderedKey, rawValue);
		// Keep the canonical key so cx() sees the same condition/property order
		// as the stylesheet for inverted nesting (`color: { _hover: ... }`).
		if (!atoms.has(atom)) atoms.set(atom, orderedKey);
		values.set(rawValue, atom);
		return atom;
	};

	return { name: "css", atoms, declare };
}
