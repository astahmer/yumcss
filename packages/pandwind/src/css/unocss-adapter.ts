/**
 * UnoCSS adapter for the css() engine — emits UnoCSS candidate strings
 * (color: "red" -> [color:red], width: "3.5rem" -> [width:3.5rem]).
 *
 * UnoCSS has no computable class formula: a class name *is* the candidate
 * string, resolved by matching the user's rules/preset. This adapter emits
 * the subset whose syntax is a fixed documented contract, verified against
 * the real @unocss/core generator + preset-mini@66.8.1:
 *
 * - arbitrary property utilities ([prop:value]) — every UnoCSS preset ships
 *   this rule (preset-mini's cssProperty rule); spaces become underscores
 *   and value validity is checked with the rule's own body contract
 *   (balanced quotes/parens, no raw brackets or nested colons) so
 *   unmatchable candidates fall back to null instead of emitting dead
 *   classes;
 * - variant prefixes via : (hover:, dark:, lt-md: plus arbitrary variants
 *   like [&:hover]: and [@media(max-width:640px)]:). Multi-selector
 *   conditions (e.g. _supportHover) chain one arbitrary variant per
 *   selector ([@media(...)]:[&:hover]:) — verified to produce the real
 *   media-wrapped rule, unlike a comma-joined single bracket.
 *
 * Preset vocabulary (bg-red-500, p-4, ...) is deliberately NOT guessed:
 * it depends on the user's preset/rules and requires a rule-matching port,
 * so those declarations return null and the engine falls back to atomic
 * hashing. Not sheet-backed — UnoCSS's own compiler owns the CSS. Unknown
 * conditions and $input dynamics throw (fail-closed, like the tailwind
 * adapter); unmatched values return null so CSS is never silently missing.
 */
import type { ClassNameStrategy } from "./class-name-strategy.ts";
import { dashCase } from "./hash.ts";
import type { AnyConditions, CssConfigReturn } from "../types/typings.ts";

/**
 * Options resolved from an UnoCSS preset and variant configuration.
 *
 * @category adapters
 * @since 0.1.0
 */
export interface UnoCssAdapterOptions {
	/**
	 * Resolved variant conditions from the user's UnoCSS config. Keys arrive
	 * underscore-prefixed (_hover -> hover:). Conditions outside this map
	 * fail closed; arbitrary variants are derived from preset condition
	 * selectors when a preset is provided.
	 */
	readonly conditions?: AnyConditions;
	/**
	 * Preset condition selectors (same shape as the stylex adapter's
	 * conditions), enabling arbitrary-variant fallbacks like
	 * [@media(max-width:640px)]: for non-variant conditions. Selector arrays
	 * become chained arbitrary variants, one segment per selector.
	 */
	readonly preset?: CssConfigReturn;
}

/**
 * UnoCSS cssProperty rule body validity (from preset-mini's
 * isValidCSSBody): balanced quotes and parens, no raw brackets, braces,
 * or nested colons outside them.
 */
const isValidCssBody = (body: string): boolean => {
	let i = 0;
	const findUntil = (c: string): boolean => {
		while (i < body.length) {
			i += 1;
			if (body[i] === c) return true;
		}
		return false;
	};
	for (i = 0; i < body.length; i++) {
		const c = body[i]!;
		if ('"`'.includes(c)) {
			if (!findUntil(c)) return false;
		} else if (c === "(") {
			if (!findUntil(")")) return false;
		} else if ("[]{}:".includes(c)) return false;
	}
	return true;
};

/** UnoCSS arbitrary-property value: spaces become underscores. */
const arbitraryValue = (value: string): string => value.replace(/ /g, "_");

/**
 * preset condition selector -> one UnoCSS variant segment. Simple pseudo
 * selectors use preset-mini's named variant ("&:hover" -> "hover");
 * everything else becomes an arbitrary variant.
 */
const arbitraryVariant = (selector: string): string | null => {
	const pseudo = selector.replace(/\s+/g, "").match(/^&::?([a-zA-Z-]+)$/u);
	if (pseudo !== null) return pseudo[1]!;
	const compressed = selector.replace(/\s+/g, "");
	if (compressed.includes("]")) return null;
	return "[" + compressed + "]";
};
/** all selectors of a condition entry -> chained arbitrary variant segments. */
const arbitraryVariants = (selector: string | readonly string[]): string | null => {
	const selectors = Array.isArray(selector) ? selector : [selector];
	const segments: string[] = [];
	for (const item of selectors) {
		const segment = arbitraryVariant(item);
		if (segment === null) return null;
		segments.push(segment);
	}
	return segments.join(":");
};

/**
 * Build an UnoCSS candidate strategy for the CSS lane.
 *
 * Only candidates that the supplied metadata can prove are emitted; other
 * declarations return `null` and use Pandwind's atomic fallback, so a class
 * is never produced without corresponding CSS.
 *
 * @example
 * ```ts
 * import { createCss } from "pandwind/css";
 * import { createUnoCssAdapter } from "pandwind/css/unocss";
 *
 * const css = createCss({ className: createUnoCssAdapter() });
 * css.class({ color: "red", width: "3.5rem" });
 * ```
 *
 * @param options - Resolved UnoCSS variants and optional preset conditions.
 * @returns A conservative UnoCSS class-name strategy.
 * @category adapters
 * @since 0.1.0
 */
export const createUnoCssAdapter = (options: UnoCssAdapterOptions = {}): ClassNameStrategy => {
	const conditions = options.conditions;
	const presetConditions = options.preset?.conditions;

	const variantPrefix = (parts: string[]): string | null => {
		let prefix = "";
		for (const raw of parts) {
			const name = conditions?.[raw];
			if (name !== undefined) {
				const variant = Array.isArray(name) ? name.join(":") : name;
				// UnoCSS multi-condition variants nest left-to-right (dark:hover:);
				// each part appends one more `variant:` segment.
				prefix = prefix === "" ? variant : prefix + ":" + variant;
				continue;
			}
			const selector = presetConditions?.[raw];
			const arbitrary = selector === undefined ? null : arbitraryVariants(selector);
			if (arbitrary === null) return null;
			prefix = prefix === "" ? arbitrary : prefix + ":" + arbitrary;
		}
		return prefix;
	};

	return {
		name: "unocss",
		toClassName(key, value) {
			if (value.startsWith("input>$")) {
				throw new Error(
					"pandwind: the unocss adapter does not support '$input' dynamics — " +
						"use the atomic engine (createCss() without a className strategy) for dynamic values",
				);
			}

			const parts = key.split("__");
			const property = parts.at(-1)!;
			const conditionParts = parts.slice(0, -1);

			const prop = dashCase(property);
			const body = arbitraryValue(value);
			if (!isValidCssBody(body)) return null;
			const candidate = "[" + prop + ":" + body + "]";
			const prefix = variantPrefix(conditionParts);
			if (prefix === null) {
				throw new Error(
					"pandwind: condition '" +
						(conditionParts.find((part) => conditions?.[part] === undefined) ?? "?") +
						"' has no UnoCSS variant and no preset condition selector",
				);
			}
			return prefix === "" ? candidate : prefix + ":" + candidate;
		},
	};
};
