import type { AtomRegistry } from "../css/atoms.ts";
import type { ClassNameStrategy } from "../css/class-name-strategy.ts";
import { createHashFn } from "../css/hash.ts";
import {
	STYLE_BACKEND_SCHEMA,
	type BackendCapabilityContract,
	type StyleBackend,
	StyleBackendId,
} from "./types.ts";
import type { StyleBackendFactory } from "./registry.ts";
import { normalizeCssValue } from "../css/value-normalization.ts";

export interface CssBackendOptions {
	debug?: boolean;
	hashFn?: (key: string, value: string | true) => string;
	className?: ClassNameStrategy;
	/** Preset conditions used to canonicalize responsive var paths. */
	conditions?: Record<string, string | string[]>;
}

const canonicalStyleKey = (key: string): string => {
	if (!key.includes("__")) return key;
	return key
		.split("__")
		.filter((part) => part !== "")
		.toSorted()
		.join("__");
};

const CSS_BACKEND_CAPABILITIES: BackendCapabilityContract = {
	schema: "pandwind.style-backend-capabilities/1",
	artifact: "stylesheet",
	unsupported: "throw",
	features: {
		declarations: "exact",
		conditions: "exact",
		"dynamic-values": "exact",
		"runtime-conditions": "unsupported",
		"unit-conversion": "exact",
		serialization: "exact",
		"stable-identity": "exact",
		ssr: "exact",
	},
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
export function createCssBackend(options: CssBackendOptions = {}): StyleBackend & {
	/** Atom registry shared with the stylesheet generator and cx. */
	atoms: AtomRegistry;
} {
	const hashFn = options.hashFn ?? createHashFn(options.debug ?? false);
	const strategy: ClassNameStrategy | undefined = options.className;
	const sheetBacked = strategy?.sheetBacked === true;
	const atoms: AtomRegistry = new Map();
	const declarations = new Map<string, string>();

	const declare = (key: string, value: string): string => {
		const orderedKey = canonicalStyleKey(key);
		const propertySeparator = orderedKey.lastIndexOf("__");
		const property =
			propertySeparator === -1 ? orderedKey : orderedKey.slice(propertySeparator + 2);
		const rawValue = normalizeCssValue(property, value);
		const cacheKey = `${orderedKey}\u0000${rawValue}`;
		const cached = declarations.get(cacheKey);
		if (cached !== undefined) return cached;
		// The stylesheet canonicalizes flattened condition paths before it
		// hashes them. Do the same at declaration time so inverted nesting
		// (`{ color: { _hover: value } }`) cannot produce an atom with no rule.
		if (strategy !== undefined) {
			const custom = strategy.toClassName(orderedKey, rawValue);
			if (custom !== null) {
				// Sheet-backed strategies compile through this engine's own
				// stylesheet, so their classes join the atom registry — that is
				// what keeps cx() merging and the generated rules working.
				if (sheetBacked && !atoms.has(custom)) atoms.set(custom, key);
				declarations.set(cacheKey, custom);
				return custom;
			}
		}
		const atom = hashFn(orderedKey, rawValue);
		// Keep the written key for cx()'s property-signature parser; only the
		// class identity uses the canonical key shared with the stylesheet.
		if (!atoms.has(atom)) atoms.set(atom, key);
		declarations.set(cacheKey, atom);
		return atom;
	};

	return { name: "css", atoms, declare };
}

export const CSS_BACKEND: StyleBackendFactory<CssBackendOptions, string> = {
	schema: STYLE_BACKEND_SCHEMA,
	id: StyleBackendId.Css,
	capabilities: CSS_BACKEND_CAPABILITIES,
	create: createCssBackend,
};
