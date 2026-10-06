import murmurHash from "../lib/murmur-hash2.ts";
import type { ClassNameStrategy } from "./class-name-strategy.ts";
import { dashCase } from "./hash.ts";

/**
 * Options controlling StyleX-compatible class identities.
 *
 * @category adapters
 * @since 0.1.0
 */
export interface StyleXAdapterOptions {
	/** StyleX's default class prefix is `x`. */
	readonly classNamePrefix?: string;
	/** Match StyleX's readable debug prefix when debugging is enabled. */
	readonly debug?: boolean;
	readonly enableDebugClassNames?: boolean;
	/** Resolved semantic condition selectors/at-rules from the active preset. */
	readonly conditions?: Readonly<Record<string, string | readonly string[]>>;
}

const modifierFor = (part: string, conditions: StyleXAdapterOptions["conditions"]): string => {
	const configured = conditions?.[part];
	if (configured === undefined) return part;
	const value = typeof configured === "string" ? configured : configured.join("");
	// StyleX hashes pseudo selectors without the semantic `&` carrier.
	return value.replaceAll("&", "");
};

/**
 * Build a StyleX-shaped, sheet-backed class-name strategy.
 *
 * The generated CSS remains YumCSS-owned, so this matches StyleX-shaped
 * class identities without shipping a second runtime.
 *
 * @example
 * ```ts
 * import { createUnsafeCss } from "yumcss/unsafe/css";
 * import { createStyleXAdapter } from "yumcss/css/stylex";
 *
 * const css = createUnsafeCss({
 *   className: createStyleXAdapter({ debug: true, enableDebugClassNames: true }),
 * });
 *
 * css.class({ color: "red" });
 * ```
 *
 * @param options - Prefix, debug, and resolved condition metadata.
 * @returns A StyleX-compatible sheet-backed strategy.
 * @category adapters
 * @since 0.1.0
 */
export const createStyleXAdapter = (options: StyleXAdapterOptions = {}): ClassNameStrategy => {
	const prefix = options.classNamePrefix ?? "x";
	const debug = options.debug ?? false;
	const enableDebugClassNames = options.enableDebugClassNames ?? false;

	return {
		name: "stylex",
		sheetBacked: true,
		toClassName(key, value) {
			const parts = key.split("__");
			const property = parts.at(-1)!;
			const modifiers = parts
				.slice(0, -1)
				.map((part) => modifierFor(part, options.conditions))
				.toSorted();
			const modifier = modifiers.join("") || "null";
			const stringToHash = `${dashCase(property)}${value}${modifier}`;
			const className = `${prefix}${murmurHash(`<>${stringToHash}`)}`;
			return debug && enableDebugClassNames ? `${property}-${className}` : className;
		},
	};
};
