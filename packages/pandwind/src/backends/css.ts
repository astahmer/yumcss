import type { AtomRegistry } from "../css/atoms.ts";
import type { ClassNameStrategy } from "../css/class-name-strategy.ts";
import type { CssCascade } from "../css/cascade.ts";
import { createHashFn } from "../css/hash.ts";
import type { StyleBackend } from "./types.ts";
import { isEncodedFirstThatWorks, normalizeFirstThatWorks } from "../css/first-that-works.ts";
import { canonicalStyleKey, cssPropertyFromKey } from "../css/style-key.ts";

export { canonicalStyleKey, cssPropertyFromKey, isEmptyCondition } from "../css/style-key.ts";

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
		// The stylesheet canonicalizes flattened condition paths before it hashes them.
		// Do the same at declaration time so inverted nesting
		// (`{ color: { _hover: ... } }`) cannot produce an atom with no rule.
		if (strategy !== undefined) {
			const custom = strategy.toClassName(orderedKey, rawValue);
			if (
				typeof custom === "string" &&
				custom.length > 0 &&
				!/\s/.test(custom) &&
				!custom.includes("\u0000")
			) {
				// Sheet-backed strategies compile through this engine's own stylesheet,
				// so their classes join the atom registry — that is what keeps cx()
				// merging and the generated rules working.
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
