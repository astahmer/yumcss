/**
 * Shared per-build engine context — the one place that knows how a literal
 * style object becomes a final class name for THIS build.
 *
 * `pandwindVite` (tw/cx inlining) and `pandwindCssVite` (stylesheet
 * generation) used to each derive class names independently. That works for
 * hashing alone (the hash is a pure function of key + value), but folding
 * `css()` atoms inside compile-time `cx()` needs the exact same
 * preset + strategy + canonicalization the stylesheet pass uses. This
 * context bundles them once:
 *
 * ```ts
 * const engine = createPandwindEngineContext({ preset: examplePreset });
 * pandwindVite({ css: { engine } });
 * pandwindCssVite(examplePreset, { engine, root: dir });
 * ```
 *
 * Both plugins stay fully usable without a context (they construct one
 * internally from their own options) — the factory exists so apps can wire
 * both plugins to one configuration source.
 *
 * Class-name derivation mirrors `createStylesheet.processFlatStyles`
 * exactly: design-resolve the literal, flatten, drop the empty condition,
 * sort the remaining path parts, then hash (or apply a sheet-backed
 * strategy). Matching the stylesheet — not the runtime engine's unsorted
 * registration keys — is deliberate: for statically-extracted styles the
 * generated sheet is the shipped truth, and its selectors are what folded
 * atoms must resolve to.
 */
import type { AtomRegistry } from "../css/atoms.ts";
import { normalizeStrategy, type AnyClassNameStrategy } from "../css/class-name-strategy.ts";
import { createHashFn } from "../css/hash.ts";
import { resolveDesignStyle } from "../design/resolve.ts";
import { flattenStyle, pairs } from "../lib/utils.ts";

import type { CssPreset } from "./css-extract.ts";

export interface PandwindEngineContextOptions {
	preset: CssPreset;
	className?: AnyClassNameStrategy;
	debug?: boolean;
}

export interface PandwindEngineContext {
	readonly preset: CssPreset;
	readonly className?: AnyClassNameStrategy;
	/**
	 * Atom registry populated by {@link foldLiteralStyle}: class name ->
	 * flattened style key. Handing this to `createCx({ css })` lets the
	 * merge resolve folded atoms against other inputs exactly like the
	 * runtime does.
	 */
	readonly registry: AtomRegistry;
	/**
	 * Compile one literal (design-vocabulary or raw) style object into the
	 * exact class string the stylesheet pass generates rules for. Returns
	 * `null` when the literal cannot be safely folded at build time:
	 * `$input` dynamics, or a class-name strategy that refuses the
	 * declaration. The caller must leave such calls to the runtime.
	 */
	foldLiteralStyle(literal: Record<string, unknown>): string | null;
}

export function createPandwindEngineContext(
	options: PandwindEngineContextOptions,
): PandwindEngineContext {
	const { preset } = options;
	const className = normalizeStrategy(options.className);
	const hashFn = createHashFn(options.debug === true);
	const registry: AtomRegistry = new Map();
	// Same empty-condition rule as the stylesheet generator: a condition
	// mapped to an empty selector contributes nothing to the atomic path.
	const emptyCondition = Object.keys(preset.conditions).find((key) => !preset.conditions[key]);

	const foldLiteralStyle = (literal: Record<string, unknown>): string | null => {
		let resolved: Record<string, unknown>;
		try {
			resolved = resolveDesignStyle(literal, preset.tokens);
		} catch {
			return null;
		}
		const flat = flattenStyle(resolved as never);

		// Canonicalize like processFlatStyles: later arguments win per
		// canonical path, and the hashed key is the sorted condition path.
		const merged = new Map<string, string>();
		for (const key in flat) {
			const value = flat[key]!;
			// $input dynamics resolve at runtime against a live stylesheet —
			// no static equivalent exists.
			if (typeof value === "string" && value.startsWith("input>$")) return null;
			const orderedKey = pairs.join(
				pairs
					.split(key)
					.filter((part) => part !== emptyCondition)
					.toSorted(),
			);
			merged.set(orderedKey, String(value));
		}

		const classes: string[] = [];
		for (const [orderedKey, value] of merged) {
			// Dynamic inputs (`css.input` / `$input` blocks) have no static
			// class — the runtime transform owns them.
			if (orderedKey.includes("$input")) return null;
			let name: string | undefined;
			if (className !== undefined) {
				try {
					name = className.toClassName(orderedKey, value) ?? undefined;
				} catch {
					// Strategy refuses the declaration (e.g. unrepresentable in
					// tailwind mode) — leave it to the runtime engine.
					return null;
				}
			}
			if (name === undefined) {
				// Byte-parity with createCss.register: engines emit the raw
				// hash (unescaped). Escaping is a stylesheet-selector concern.
				name = hashFn(orderedKey, value);
			}
			if (className?.sheetBacked === true || className === undefined) {
				registry.set(name, orderedKey);
			}
			classes.push(name);
		}
		return classes.join(" ");
	};

	return { preset, className, registry, foldLiteralStyle };
}
