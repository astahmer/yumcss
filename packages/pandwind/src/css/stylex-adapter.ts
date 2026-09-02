import murmurHash from "../lib/murmur-hash2.ts";
import type { ClassNameStrategy } from "./class-name-strategy.ts";
import { dashCase } from "./hash.ts";

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
	const value = Array.isArray(configured) ? configured.join("") : configured;
	// StyleX hashes pseudo selectors without the semantic `&` carrier.
	return value.replaceAll("&", "");
};

/**
 * Emit StyleX-compatible atomic class identities for Pandwind's stylesheet.
 *
 * The hash follows StyleX's stable atomic formula: dashed property, normalized
 * value, sorted condition modifier, and the `<>` compatibility marker. The
 * generated CSS remains Pandwind-owned (`sheetBacked: true`), so this adapter
 * is useful when a project wants StyleX-shaped classes without shipping the
 * StyleX runtime or changing its source API.
 *
 * Condition metadata is intentionally injected rather than guessed. Without
 * it, semantic condition names still produce deterministic valid class names;
 * with it, selectors and at-rules participate in the same identity input as
 * StyleX. Custom conditions therefore work without another hardcoded catalog.
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
