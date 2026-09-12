import { type CreateCssOptions, type CssFn, createCss } from "../css/create-css.ts";
import { ATOM_REGISTRY, type AtomRegistry } from "../css/atoms.ts";
import { assign } from "../lib/utils.ts";
import type { StyleObject } from "../types/typings.ts";
import { resolveDesignStyle } from "./resolve.ts";
import type { DesignPreset, DesignStyleObject } from "./types.ts";

/**
 * Intent-oriented CSS factory and style types for `pandwind/design`.
 *
 * @category design system
 * @since 0.1.0
 */

type Maybe<T> = T | undefined | null | false;

/**
 * Create a preset-aware CSS function with `$frame`, `$layout`, and `$text` modules.
 *
 * @example
 * ```ts
 * import { createDesignCss } from "pandwind/design";
 * import { examplePreset } from "@pandwind/example-preset";
 *
 * const dss = createDesignCss(examplePreset);
 *
 * const className = dss.class({
 *   $frame: { corners: "lg", fill: "$blue-500", pad: [8, 16] },
 *   $layout: { flow: "stackX", align: "center", gap: 8 },
 *   $text: { color: "$gray-50", weight: "semibold" },
 *   _hover: { $frame: { fill: "$blue-600" } },
 * });
 * ```
 *
 * @typeParam TPreset - Design-compatible preset carrying tokens and conditions.
 * @param preset - The preset that defines the design token vocabulary.
 * @param options - CSS backend options.
 * @returns A preset-aware {@link CssFn} over {@link DesignStyleObject} values.
 * @see {@link createCss} for ordinary CSS property objects.
 * @category factories
 * @since 0.1.0
 */
export const createDesignCss = <TPreset extends DesignPreset>(
	preset: TPreset,
	options: CreateCssOptions = {},
): CssFn<DesignStyleObject<TPreset>> => {
	const engine = createCss({ ...options, conditions: preset.conditions }) as CssFn<StyleObject>;
	type Design = DesignStyleObject<TPreset>;

	const resolve = (style: Design): StyleObject =>
		resolveDesignStyle(style as unknown as Record<string, unknown>, preset.tokens);

	const dss = (...styles: Array<Maybe<Design>>) =>
		engine(...(styles.filter(Boolean) as Array<Design>).map(resolve));

	dss.class = (...styles: Array<Maybe<Design>>) =>
		engine.class(...(styles.filter(Boolean) as Array<Design>).map(resolve));

	dss.raw = (...styles: Array<Maybe<Design>>) =>
		engine.raw(...(styles.filter(Boolean) as Array<Design>).map(resolve));

	// Dynamic values ride inline custom properties; design-layer tokens are
	// resolved first so the inline value is concrete.
	dss.vars = (...styles: Array<Maybe<Design>>) => {
		const resolvedStyles = assign(
			...(styles.filter(Boolean) as Array<Design>).map(resolve),
		) as StyleObject;
		return engine.vars(resolvedStyles as never);
	};

	dss.props = engine.props;
	dss.input = engine.input;

	dss.group = ((groups: Record<string, Maybe<Design> | ((...args: any[]) => Design)>) => {
		const resolved = Object.create(null) as Record<
			string,
			StyleObject | ((...args: any[]) => StyleObject)
		>;
		for (const key of Object.keys(groups)) {
			const value = groups[key];
			if (typeof value === "function") {
				resolved[key] = (...args: any[]) => resolve(value(...args));
			} else if (value) {
				resolved[key] = resolve(value);
			}
		}
		return engine.group(resolved as never);
	}) as never;

	// Share the inner engine's atom registry so cx can resolve design atoms.
	(dss as CssFn & { [ATOM_REGISTRY]?: AtomRegistry })[ATOM_REGISTRY] = (
		engine as CssFn & { [ATOM_REGISTRY]?: AtomRegistry }
	)[ATOM_REGISTRY];

	return dss as CssFn<Design>;
};

export type { DesignPreset, DesignStyleObject } from "./types.ts";
