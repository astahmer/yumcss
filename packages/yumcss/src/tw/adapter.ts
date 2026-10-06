/**
 * Tailwind adapter for the css() engine — the "same class from both APIs"
 * bridge.
 *
 * The atomic engine hashes `(key, value)` into opaque class names and
 * generates its own stylesheet; the tailwind adapter instead maps each
 * declaration to a literal Tailwind utility (`color: #3182ce` ->
 * `text-blue-500`). Both `css({ color: "$blue-500" })` and
 * `tw({ text: "blue-500" })` then emit the *same* class and Tailwind
 * compiles the CSS exactly once — no duplicated rules, no growth.
 *
 * The adapter is total:
 *
 * - values with a bridge entry use the shortest matching utility
 *   (`rounded-md`, `bg-red-500`, `w-4`);
 * - values without one fall back to an arbitrary property
 *   (`[width:3.5rem]`, `[border-radius:8px]`) — still a real Tailwind
 *   class, so CSS is never missing;
 * - conditions that match a Tailwind variant use the short form
 *   (`hover:`, `sm:`, `group-hover:`); other preset conditions fall back to
 *   arbitrary variants (`[@media(max-width:640px)]:`, `[&:hover]:`);
 * - declarations that genuinely have no Tailwind representation (unknown
 *   conditions, `$input` dynamics) return `null`, and the engine falls back
 *   to atomic hashing — a hybrid app keeps a yumcss stylesheet for those
 *   few declarations only.
 */
import { dashCase } from "../css/hash.ts";
import type { ClassNameStrategy } from "../css/class-name-strategy.ts";
import { buildTokenMaps, resolveTokenValue } from "../css/tokens.ts";
import type { AnyConditions, CssConfigReturn } from "../types/typings.ts";
import type { TwVariantsMeta } from "./compile.ts";

/**
 * Generated `(property, resolved value) -> utility` lookup for Tailwind mode.
 *
 * The map comes from the active Tailwind project, so custom utilities and
 * aliases retain their project-specific semantics.
 *
 * @category adapters
 * @since 0.1.0
 */
export type UtilityBridge = Record<string, Record<string, string>>;

/**
 * Configuration emitted by `yumcss-codemod tw generate`.
 *
 * @category adapters
 * @since 0.1.0
 */
export interface TwAdapterOptions {
	/** Variant metadata from generated tw runtime artifacts (join separators). */
	variants: TwVariantsMeta;
	/** Generated `(property, resolved value) -> utility` map. */
	bridge: UtilityBridge;
	/**
	 * Optional preset: enables token resolution (`$blue-500` -> `#3182ce`)
	 * and arbitrary-variant fallbacks for preset conditions.
	 */
	preset?: CssConfigReturn;
}

const normalizeCondition = (part: string): string => dashCase(part.replace(/^_/, ""));

/** `&:hover, &[data-active=true]` -> `[&:hover,&[data-active=true]]`. */
function arbitraryVariant(selector: string): string | null {
	const compressed = selector.replace(/\s+/g, "");
	if (compressed.includes("]")) return null;
	return `[${compressed}]`;
}

/** `"50%"` -> `50%`; spaces become underscores like any TW arbitrary value. */
function arbitraryValue(value: string): string {
	return value.replace(/ /g, "_");
}

/**
 * Build a class-name strategy from generated Tailwind metadata.
 *
 * Pass the result as `className` to `createCss` or `createDesignCss` to reuse
 * Tailwind's class vocabulary.
 *
 * @example
 * ```ts
 * import { createUnsafeCss } from "yumcss/unsafe/css";
 * import { createTwAdapter } from "yumcss/tw";
 *
 * const adapter = createTwAdapter({
 *   variants: {},
 *   bridge: {
 *     "background-color": { "#3182ce": "bg-blue-500" },
 *   },
 * });
 *
 * const css = createUnsafeCss({ className: adapter });
 * css.class({ backgroundColor: "#3182ce" });
 * // "bg-blue-500"
 * ```
 *
 * @param options - Generated utility, variant, and optional preset metadata.
 * @returns A strategy for `createCss` or `createDesignCss`.
 * @category adapters
 * @since 0.1.0
 */
export function createTwAdapter(options: TwAdapterOptions): ClassNameStrategy {
	const { variants, bridge } = options;
	const preset = options.preset;
	const conditions: AnyConditions | undefined = preset?.conditions;
	const tokenMaps = preset === undefined ? undefined : buildTokenMaps(preset, false);
	const resolveValue = (property: string, value: string): string =>
		tokenMaps === undefined
			? value
			: resolveTokenValue(tokenMaps, property, value, { concrete: true });

	const isCondition = (part: string): boolean => {
		if (conditions !== undefined && conditions[part] !== undefined) return true;
		return variants[normalizeCondition(part)] !== undefined;
	};

	const variantPrefix = (parts: string[]): string | null => {
		let prefix = "";
		let parent: string | undefined;
		for (const raw of parts) {
			const part = normalizeCondition(raw);
			if (variants[part] !== undefined) {
				prefix = parent === undefined ? part : `${prefix}${variants[parent]?.join ?? ":"}${part}`;
				parent = part;
				continue;
			}
			const selector = conditions?.[raw];
			const arbitrary =
				selector === undefined
					? null
					: arbitraryVariant(Array.isArray(selector) ? selector.join("") : selector);
			if (arbitrary === null) return null;
			prefix =
				parent === undefined ? arbitrary : `${prefix}${variants[parent]?.join ?? ":"}${arbitrary}`;
			parent = undefined;
		}
		return prefix;
	};

	return {
		name: "tailwind",
		// Not sheet-backed: Tailwind's own scanner/compiler generates the CSS
		// for these utilities, so the classes must stay out of the atom
		// registry and out of any generated yumcss stylesheet.
		toClassName(key, value) {
			// `$input` dynamics resolve at runtime against the atomic engine's
			// generated stylesheet — unsupported in tailwind mode. Fail loudly:
			// silently emitting a hashed atom here would leave the class without
			// any CSS (the tailwind mode has no atomic sheet).
			if (value.startsWith("input>$")) {
				throw new Error(
					"yumcss: the tailwind adapter does not support `$input` dynamics — " +
						"use the atomic engine (`createUnsafeCss()` without a className strategy) for dynamic values",
				);
			}

			const parts = key.split("__");
			const propParts = parts.filter((part) => !isCondition(part));
			if (propParts.length !== 1) {
				throw new Error(
					`yumcss: cannot map '${key}' to a Tailwind utility — the key must contain exactly one CSS property`,
				);
			}
			const propKey = propParts[0]!;
			const prop = dashCase(propKey);
			const resolved = resolveValue(propKey, value);
			const utility = bridge[prop]?.[resolved] ?? `[${prop}:${arbitraryValue(resolved)}]`;
			const prefix = variantPrefix(parts.filter((part) => isCondition(part)));
			if (prefix === null) {
				throw new Error(
					`yumcss: condition '${parts.find((part) => isCondition(part))}' has no Tailwind variant and no preset condition selector`,
				);
			}
			return prefix === "" ? utility : `${prefix}:${utility}`;
		},
	};
}
