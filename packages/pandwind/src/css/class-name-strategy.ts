/**
 * Pluggable class-name strategies for the css() engine — the "same API,
 * swappable output" contract.
 *
 * A strategy decides, per flattened declaration (style key like `color` or
 * `_hover__color`, plus its written value), which class name the engine
 * emits. The default atomic mode is what you get without a strategy:
 * `(key, value)` is hashed into an opaque class and registered in the atom
 * registry so a generated pandwind stylesheet can compile it.
 *
 * ## Contract
 *
 * - `toClassName(key, value)` returns the final class name for that
 *   declaration, or `null` to fall back to the default atomic strategy.
 * - The returned string must be usable as-is in a `class` attribute.
 * - Condition nesting arrives pre-flattened into the key (`_hover__color`),
 *   `__`-separated, outermost condition first; a strategy that maps
 *   conditions to variants must join them with its own variant separator
 *   (`hover:text-blue-500`).
 * - A strategy may throw for declarations it refuses to represent
 *   (e.g. `$input` dynamics) — failing loudly beats emitting a class
 *   without CSS.
 * - `sheetBacked: true` declares that the emitted classes are compiled by
 *   *this* engine's stylesheet generation (the classes are registered in
 *   the atom registry and used as selector names by `createStylesheet`).
 *   Strategies backed by an external compiler (Tailwind) leave it unset:
 *   their classes need no entry in any generated sheet, so nothing is
 *   registered and the stylesheet stays byte-identical to no-strategy use.
 *
 * @category adapters
 * @since 0.1.0
 */

export interface ClassNameStrategy {
	/** Mode id, e.g. `"tailwind"` or `"named-atoms"` (docs/debug). */
	readonly name: string;
	/**
	 * When true the engine registers returned classes in the atom registry
	 * and uses them as selector names in the generated stylesheet. See the
	 * module contract above.
	 */
	readonly sheetBacked?: boolean;
	/**
	 * Convert a flattened declaration into a class name.
	 *
	 * Return `null` when the strategy cannot represent a declaration and the
	 * atomic fallback should own it. A strategy that returns a class must also
	 * ensure that another compiler owns the corresponding CSS, unless
	 * `sheetBacked` is true.
	 *
	 * @example
	 * ```ts
	 * import type { ClassNameStrategy } from "pandwind/css";
	 *
	 * const strategy: ClassNameStrategy = {
	 *   name: "named",
	 *   toClassName: (key, value) => `app-${key}-${value}`,
	 * };
	 * ```
	 *
	 * @param key - Flattened property/condition path such as `_hover__color`.
	 * @param value - The normalized declaration value.
	 * @returns A host-safe class name, or `null` for the atomic fallback.
	 */
	toClassName(key: string, value: string): string | null;
}
