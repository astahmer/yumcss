import type { AtomRegistry } from "../css/atoms.ts";
import {
	normalizeStrategy,
	type AnyClassNameStrategy,
	type ClassNameStrategy,
} from "../css/class-name-strategy.ts";
import { createHashFn } from "../css/hash.ts";
import type { StyleBackend } from "./types.ts";

export interface CssBackendOptions {
	debug?: boolean;
	hashFn?: (key: string, value: string | true) => string;
	className?: AnyClassNameStrategy;
}

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
	const strategy: ClassNameStrategy | undefined = normalizeStrategy(options.className);
	const sheetBacked = strategy?.sheetBacked === true;
	const atoms: AtomRegistry = new Map();

	const declare = (key: string, value: string): string => {
		const rawValue = String(value);
		if (strategy !== undefined) {
			const custom = strategy.toClassName(key, rawValue);
			if (custom !== null) {
				// Sheet-backed strategies compile through this engine's own
				// stylesheet, so their classes join the atom registry — that is
				// what keeps cx() merging and the generated rules working.
				if (sheetBacked && !atoms.has(custom)) atoms.set(custom, key);
				return custom;
			}
		}
		const atom = hashFn(key, rawValue);
		if (!atoms.has(atom)) atoms.set(atom, key);
		return atom;
	};

	return { name: "css", atoms, declare };
}
