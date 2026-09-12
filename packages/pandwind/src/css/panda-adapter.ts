/**
 * Panda adapter for the css() engine — emits Panda-shaped atomic class
 * names (backgroundColor: "red.500" -> bg-red.500).
 *
 * The formula is Panda's default non-hash output, verified against the real
 * @pandacss/shared runtime and @pandacss/generator@1.12.0 artifacts:
 *
 * - prop names resolve through the generated classNameByProp map
 *   (shorthands like backgroundColor -> bg); unknown props are hyphenated
 *   (borderRadius -> border-radius);
 * - values replace spaces with underscores (w-calc(100%_-_20px));
 * - conditions are finalized like the generator's finalizeConditions:
 *   configured keys become their underscore-stripped name (_hover ->
 *   hover), raw &/at-rule paths are bracketed ([&:hover],
 *   [@media(hover:hover)]) and joined with : (hover:bg_red_500);
 * - an optional prefix is prepended with - (ui-bg-red.500).
 *
 * Hash mode is intentionally unsupported: the atomic hash depends on the
 * user's full generator config, and a mismatched hash would produce classes
 * Panda itself would not recognize. hash: false is Panda's default.
 *
 * Not sheet-backed: Panda's own compiler owns the CSS for these classes, so
 * emitting one into a Pandwind stylesheet would duplicate ownership.
 * Declarations that cannot be represented fail closed (throw for unknown
 * conditions / $input dynamics, mirroring the tailwind adapter); the
 * engine falls back to atomic hashing only where the adapter returns null.
 */
import type { ClassNameStrategy } from "./class-name-strategy.ts";
import { dashCase } from "./hash.ts";
import type { AnyConditions } from "../types/typings.ts";

/**
 * Options resolved from a Panda project configuration.
 *
 * @category adapters
 * @since 0.1.0
 */
export interface PandaAdapterOptions {
	/**
	 * Shorthand map from the user's Panda config (generated classNameByProp
	 * entries), e.g. { backgroundColor: "bg", width: "w" }. Props outside
	 * the map are hyphenated, exactly like Panda's fallback.
	 */
	readonly propClasses?: Readonly<Record<string, string>>;
	/** Class prefix from the user's Panda config. */
	readonly prefix?: string;
	/**
	 * Condition keys from the user's Panda config (same shape as the stylex
	 * adapter's conditions). The engine delivers underscore-prefixed parts
	 * (_hover); both the raw and the underscore-stripped key resolve.
	 */
	readonly conditions?: AnyConditions;
}

/** Panda's withoutSpace: intra-value spaces become underscores. */
const withoutSpace = (value: string): string => value.replaceAll(" ", "_");

/** Panda's finalizeConditions bracketing for raw selector/at-rule paths. */
const finalizeCondition = (selector: string): string => {
	const compact = selector.replaceAll(/[\n\s]+/g, " ").trim();
	return /[&@]/.test(compact) ? "[" + withoutSpace(compact) + "]" : compact;
};

/**
 * Panda's hypenateProperty: camelCase -> kebab-case (the -ms- vendor
 * prefix keeps its leading dash).
 */
const hypenateProperty = (property: string): string => {
	if (property.startsWith("--")) return property;
	return dashCase(property);
};

/**
 * Build a class-name strategy compatible with Panda's non-hash output.
 *
 * Pass it as `className` to `createCss` or `createDesignCss`. The adapter uses
 * resolved shorthand and condition maps and does not guess unknown vocabulary.
 *
 * @example
 *
 * ```ts
 * import { createCss } from "pandwind/css";
 * import { createPandaAdapter } from "pandwind/css/panda";
 *
 * const css = createCss({
 *   className: createPandaAdapter({
 *     propClasses: { backgroundColor: "bg" },
 *   }),
 * });
 *
 * css.class({ backgroundColor: "red.500" });
 * ```
 *
 * @param options - Resolved Panda shorthand and condition metadata.
 * @returns A Panda-compatible class-name strategy.
 * @category adapters
 * @since 0.1.0
 */
export const createPandaAdapter = (options: PandaAdapterOptions = {}): ClassNameStrategy => {
	const propClasses = options.propClasses ?? {};
	const conditions = options.conditions;
	const prefix = options.prefix;

	const propKey = (prop: string): string => propClasses[prop] ?? hypenateProperty(prop);

	const conditionName = (part: string): string | null => {
		// Panda finalizeConditions maps configured condition keys to their
		// underscore-stripped name (the selector only decides the CSS, not
		// the class); raw &/at-rule paths are bracketed instead.
		if (conditions?.[part] !== undefined || conditions?.[part.replace(/^_/, "")] !== undefined) {
			return part.replace(/^_/, "");
		}
		return null;
	};

	return {
		name: "panda",
		toClassName(key, value) {
			if (value.startsWith("input>$")) {
				throw new Error(
					"pandwind: the panda adapter does not support '$input' dynamics — " +
						"use the atomic engine (createCss() without a className strategy) for dynamic values",
				);
			}

			const parts = key.split("__");
			const property = parts.at(-1)!;
			const conditionParts = parts.slice(0, -1);
			const finalized: string[] = [];
			for (const part of conditionParts) {
				let name = conditionName(part);
				if (name === null) {
					if (!/[&@]/.test(part)) {
						throw new Error(
							"pandwind: condition '" +
								part +
								"' is not in the panda adapter resolved conditions — " +
								"pass the user panda config conditions (unknown conditions cannot be emitted)",
						);
					}
					name = finalizeCondition(part);
				}
				finalized.push(name);
			}

			const base = propKey(property) + "-" + withoutSpace(value);
			const className = prefix === undefined ? base : prefix + "-" + base;
			return finalized.length === 0 ? className : finalized.join(":") + ":" + className;
		},
	};
};
