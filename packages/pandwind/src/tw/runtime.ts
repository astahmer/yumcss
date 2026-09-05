/**
 * `tw` runtime: converts a Panda-like style object into Tailwind class strings.
 *
 * The heavy lifting (utility types, variants, value completions) is generated
 * from the real Tailwind design system by `tw/generate-types.ts`; this module
 * binds a typed `tw` instance to the pure compiler in `tw/compile.ts`.
 *
 * ```ts
 * import { createTw } from "pandwind/tw";
 * import type { WindVariants } from "./types";
 *
 * export const tw = createTw<WindVariants>({
 *   variants: { group: { dash: true } },
 * });
 *
 * tw({ bg: "sky-600", sm: { py: "12" } }); // -> "bg-sky-600 sm:py-12"
 * tw({ group: { hover: { opacity: "100" } } }); // -> "group-hover:opacity-100"
 * ```
 */
import {
	compileStyles,
	type TwComposeMeta,
	type TwConflictsMeta,
	type TwNestedStyles,
	type TwVariantsMeta,
} from "./compile.ts";

export type {
	TwComposeMeta,
	TwConflictsMeta,
	TwNestedStyles,
	TwValue,
	TwVariantsMeta,
} from "./compile.ts";

export interface TwOptions {
	variants?: TwVariantsMeta;
	/** Generated conflict map enabling last-wins merging (see `compile.ts`). */
	conflicts?: TwConflictsMeta;
	/**
	 * Real design-system value sets for utilities whose conflict entries
	 * collapsed to the `"*"` wildcard. Strict verification (finite dynamic
	 * candidate registration) exact-matches against these instead of trusting
	 * the wildcard; ordinary compilation ignores them.
	 */
	/** Arrays at rest (generated artifact); Sets after Vite extraction. Compilation ignores this field. */
	wildcardValues?: Record<string, ReadonlyArray<string> | ReadonlySet<string>>;
	/**
	 * Raw-value to token spelling reverse catalog for dynamic candidate remap
	 * (generated artifact; see `codegen-conflicts.ts`). Compilation remaps an
	 * exact raw-value match to its configured token spelling before class
	 * assembly; ordinary static inlining is unaffected.
	 */
	valueTokens?: Record<string, Readonly<Record<string, string>>>;
	/** Generated composing utilities that must never merge across keys. */
	compose?: TwComposeMeta;
}

/**
 * Create a typed `tw` function bound to a generated design-system type.
 */
export function createTw<T>(options: TwOptions = {}): (styles: T) => string {
	const variants = options.variants ?? {};
	const conflicts = options.conflicts;
	const compose =
		options.compose === undefined || options.compose.length === 0
			? undefined
			: new Set(options.compose);
	const valueTokens = options.valueTokens;
	return (styles) =>
		compileStyles(styles as TwNestedStyles, variants, conflicts, compose, valueTokens);
}

/**
 * Untyped convenience `tw` — useful before codegen or for throwaway styles.
 */
export function tw(styles: TwNestedStyles): string {
	return compileStyles(styles, {});
}
