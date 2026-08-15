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
 *   to atomic hashing — a hybrid app keeps a pandwind stylesheet for those
 *   few declarations only.
 */
import { dashCase } from "../css/hash.ts";
import type { ClassNameStrategy } from "../css/create-css.ts";
import { createTokenResolver } from "../css/tokens.ts";
import type { AnyConditions, CssConfigReturn } from "../types/typings.ts";
import type { UtilityBridge } from "./bridge.ts";
import type { TwVariantsMeta } from "./compile.ts";

export interface TwAdapterOptions {
	/** Variant metadata from the generated `tw.ts` (join separators). */
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
 * Build the engine's pluggable class strategy. Pass the result as
 * `createCss(preset, { className })` / `createDesignCss(preset, { className })`.
 */
export function createTwAdapter(options: TwAdapterOptions): ClassNameStrategy {
	const { variants, bridge } = options;
	const preset = options.preset;
	const conditions: AnyConditions | undefined = preset?.conditions;
	const resolveValue =
		preset === undefined ? (prop: string, value: string) => value : createTokenResolver(preset);

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

	return (key, value) => {
		// `$input` dynamics resolve at runtime against the atomic engine's
		// generated stylesheet — out of scope for literal Tailwind classes.
		if (value.startsWith("input>$")) return null;

		const parts = key.split("__");
		const propParts = parts.filter((part) => !isCondition(part));
		if (propParts.length !== 1) return null;
		const propKey = propParts[0]!;
		const prop = dashCase(propKey);
		const resolved = resolveValue(propKey, value);
		const utility = bridge[prop]?.[resolved] ?? `[${prop}:${arbitraryValue(resolved)}]`;
		const prefix = variantPrefix(parts.filter((part) => isCondition(part)));
		if (prefix === null) return null;
		return prefix === "" ? utility : `${prefix}:${utility}`;
	};
}
